// Package mercadopago is a thin client over the MercadoPago subscriptions
// (preapproval) API — the parts SGHCP needs to bill tenants in Colombia.
//
// Flow (hosted, no card data touches us): create one preapproval_plan per org
// carrying external_reference = org id, redirect the owner to its init_point so
// MercadoPago captures the card, then react to the webhook by fetching the
// resulting subscription and reading back the external_reference.
package mercadopago

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const base = "https://api.mercadopago.com"

// MinChargeCOP is the smallest amount MercadoPago accepts on a Colombian
// preapproval. Below it, checkout is refused with "Cannot pay an amount lower
// than $ 1600.00" — their 400, our 502, and "no se pudo iniciar el pago" in
// front of somebody with their card out. Production met this on 2026-08-18
// with the plan set to $1.000.
//
// MercadoPago owns this number and can move it, so the checkout path still has
// to handle being refused. This constant exists so that being refused is not
// how anyone finds out.
const MinChargeCOP = 1600

// VerifyWebhook validates a MercadoPago webhook's x-signature against the
// configured webhook secret. The signed manifest is
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" hashed with HMAC-SHA256.
// It returns (ok, detail) where detail describes the mismatch for diagnostics
// (never logged in the success path). Fails closed when no secret is set.
func VerifyWebhook(secret, xSignature, xRequestID, dataID string) (bool, string) {
	if secret == "" {
		return false, "no webhook secret configured"
	}
	var ts, v1 string
	for _, part := range strings.Split(xSignature, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch strings.TrimSpace(kv[0]) {
		case "ts":
			ts = strings.TrimSpace(kv[1])
		case "v1":
			v1 = strings.TrimSpace(kv[1])
		}
	}
	if ts == "" || v1 == "" {
		return false, "x-signature missing ts/v1"
	}
	var manifest strings.Builder
	if dataID != "" {
		manifest.WriteString("id:" + strings.ToLower(dataID) + ";")
	}
	if xRequestID != "" {
		manifest.WriteString("request-id:" + xRequestID + ";")
	}
	manifest.WriteString("ts:" + ts + ";")

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(manifest.String()))
	expected := hex.EncodeToString(mac.Sum(nil))
	if hmac.Equal([]byte(expected), []byte(v1)) {
		return true, ""
	}
	return false, fmt.Sprintf("mismatch manifest=%q dataID=%q reqID=%q expected=%s got=%s",
		manifest.String(), dataID, xRequestID, expected, v1)
}

type Client struct {
	accessToken string
	http        *http.Client
	baseURL     string
}

func New(accessToken string) *Client {
	return newAt(accessToken, base)
}

// newAt points a client at another host. Only the tests use it, and they exist
// because the bug of 2026-08-18 was in the query string itself: nothing short
// of watching the request go out could have caught it.
func newAt(accessToken, baseURL string) *Client {
	return &Client{
		accessToken: accessToken,
		http:        &http.Client{Timeout: 15 * time.Second},
		baseURL:     baseURL,
	}
}

// Enabled reports whether billing is configured (a token is present).
func (c *Client) Enabled() bool { return c.accessToken != "" }

// CreatePlan creates a monthly COP subscription plan tied to an org and returns
// its id and the hosted checkout URL (init_point) the owner is redirected to.
func (c *Client) CreatePlan(ctx context.Context, orgID, reason string, amountCOP int, backURL, notificationURL string) (planID, initPoint string, err error) {
	payload := map[string]any{
		"reason":             reason,
		"external_reference": orgID,
		"back_url":           backURL,
		"notification_url":   notificationURL,
		"auto_recurring": map[string]any{
			"frequency":          1,
			"frequency_type":     "months",
			"transaction_amount": amountCOP,
			"currency_id":        "COP",
		},
		"payment_methods_allowed": map[string]any{
			"payment_types": []map[string]string{{"id": "credit_card"}},
		},
	}
	var out struct {
		ID        string `json:"id"`
		InitPoint string `json:"init_point"`
		Message   string `json:"message"`
	}
	if err := c.do(ctx, http.MethodPost, "/preapproval_plan", payload, &out); err != nil {
		return "", "", err
	}
	if out.ID == "" {
		return "", "", fmt.Errorf("mercadopago: plan not created: %s", out.Message)
	}
	return out.ID, out.InitPoint, nil
}

// Preapproval is a subscriber's subscription as returned by the API.
type Preapproval struct {
	ID     string `json:"id"`
	Status string `json:"status"` // pending | authorized | paused | cancelled
	// ExternalReference is empty on every preapproval born from a
	// preapproval_plan: MercadoPago does not copy the plan's onto the
	// subscription it creates. Verified against the live API on 2026-08-18,
	// after months of it being the only thing used to find the tenant.
	ExternalReference string `json:"external_reference"`
	// PreapprovalPlanID is the link that does survive. The org row has held it
	// in provider_customer_id since its checkout was created.
	PreapprovalPlanID string `json:"preapproval_plan_id"`
	NextPaymentDate   string `json:"next_payment_date"` // RFC3339-ish
	PayerEmail        string `json:"payer_email"`
}

// GetPreapproval fetches a subscription by id (from a webhook notification).
func (c *Client) GetPreapproval(ctx context.Context, id string) (*Preapproval, error) {
	var p Preapproval
	if err := c.do(ctx, http.MethodGet, "/preapproval/"+id, nil, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// FindPreapprovalByPlan returns the most-recent preapproval for the given plan id.
func (c *Client) FindPreapprovalByPlan(ctx context.Context, planID string) (*Preapproval, error) {
	var out struct {
		Results []Preapproval `json:"results"`
	}
	// sort is "field:direction" here. The separate sort/criteria pair is the
	// /v1/payments/search convention, and this endpoint answers it with
	// 400 "Invalid sorting value format." — which is what it did, every time,
	// from the day this was written until 2026-08-18.
	if err := c.do(ctx, http.MethodGet,
		"/preapproval/search?preapproval_plan_id="+url.QueryEscape(planID)+
			"&sort=date_created:desc&limit=1",
		nil, &out); err != nil {
		return nil, err
	}
	if len(out.Results) == 0 {
		return nil, fmt.Errorf("mercadopago: no preapproval found for plan %s", planID)
	}
	return &out.Results[0], nil
}

// PatchPreapprovalNotificationURL sets the notification_url on an existing preapproval
// so that future events (renewals, cancellations) reach the webhook endpoint.
func (c *Client) PatchPreapprovalNotificationURL(ctx context.Context, preapprovalID, notificationURL string) error {
	return c.do(ctx, http.MethodPut, "/preapproval/"+preapprovalID,
		map[string]string{"notification_url": notificationURL}, nil)
}

// CreatePreference creates a one-time Checkout Pro preference (used for patient
// appointment payments) and returns its id and hosted checkout URL.
// When allowDeferred is false, cash/voucher methods (Efecty = "ticket", ATM)
// are excluded — the caller only allows those when the appointment is far
// enough out that holding the slot until the voucher's real expiration
// (days, not hours) still makes sense.
func (c *Client) CreatePreference(ctx context.Context, title string, amountCOP int, externalRef, payerEmail, payerFirstName, payerLastName, backURL, notificationURL string, allowDeferred bool) (prefID, initPoint string, err error) {
	payload := map[string]any{
		"items": []map[string]any{{
			"title":       title,
			"description": title,
			"quantity":    1,
			"unit_price":  amountCOP,
			"currency_id": "COP",
		}},
		"external_reference": externalRef,
		"back_urls":          map[string]string{"success": backURL, "failure": backURL, "pending": backURL},
		// No auto_return: MercadoPago shows a manual "Volver al sitio" button on
		// its success screen instead of an automatic countdown redirect.
		"notification_url": notificationURL,
		"payer": map[string]string{
			"email":      payerEmail,
			"first_name": payerFirstName,
			"last_name":  payerLastName,
		},
	}
	if !allowDeferred {
		payload["payment_methods"] = map[string]any{
			"excluded_payment_types": []map[string]string{{"id": "ticket"}, {"id": "atm"}},
		}
	}
	var out struct {
		ID        string `json:"id"`
		InitPoint string `json:"init_point"`
		Message   string `json:"message"`
	}
	if err := c.do(ctx, http.MethodPost, "/checkout/preferences", payload, &out); err != nil {
		return "", "", err
	}
	if out.InitPoint == "" {
		return "", "", fmt.Errorf("mercadopago: preference not created: %s", out.Message)
	}
	return out.ID, out.InitPoint, nil
}

// Payment is a single charge (used for recurring renewal notifications).
type Payment struct {
	ID                int64  `json:"id"`
	Status            string `json:"status"` // approved | pending | in_process | rejected | ...
	ExternalReference string `json:"external_reference"`
	// How the payment was made. PaymentTypeID is the coarse category
	// (credit_card | debit_card | ticket | bank_transfer | account_money | atm);
	// PaymentMethodID is the brand (visa | pse | efecty | nequi | …).
	PaymentTypeID   string `json:"payment_type_id"`
	PaymentMethodID string `json:"payment_method_id"`
	// Deferred (cash/voucher) payments: when the voucher expires and where the
	// patient can reopen it to pay. Empty for instant methods (card, PSE).
	DateOfExpiration   string `json:"date_of_expiration"` // RFC3339
	TransactionDetails struct {
		ExternalResourceURL string `json:"external_resource_url"`
	} `json:"transaction_details"`
}

// GetPayment fetches a payment by id (from an authorized-payment webhook).
func (c *Client) GetPayment(ctx context.Context, id string) (*Payment, error) {
	var p Payment
	if err := c.do(ctx, http.MethodGet, "/v1/payments/"+id, nil, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// SearchPayment returns the most recent payment for the given external
// reference. Used to reconcile a one-time Checkout Pro payment (e.g. annual
// prepay) on return from checkout, when the webhook hasn't arrived yet.
func (c *Client) SearchPayment(ctx context.Context, externalRef string) (*Payment, error) {
	var out struct {
		Results []Payment `json:"results"`
	}
	q := "/v1/payments/search?external_reference=" + url.QueryEscape(externalRef) +
		"&sort=date_created&criteria=desc&limit=1"
	if err := c.do(ctx, http.MethodGet, q, nil, &out); err != nil {
		return nil, err
	}
	if len(out.Results) == 0 {
		return nil, fmt.Errorf("mercadopago: no payment found for external_reference %s", externalRef)
	}
	return &out.Results[0], nil
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("mercadopago request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		var e struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&e)
		return fmt.Errorf("mercadopago %d: %s", resp.StatusCode, e.Message)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}
