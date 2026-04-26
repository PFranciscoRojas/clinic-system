package token

import "github.com/golang-jwt/jwt/v5"

// Claims are the JWT payload fields present in every authenticated request.
// Permissions are embedded at login time so middleware never needs a DB call per request.
type Claims struct {
	UserID         string   `json:"sub"`
	OrganizationID string   `json:"org"`
	Roles          []string `json:"roles"`
	Permissions    []string `json:"perms"`
	jwt.RegisteredClaims
}

// Pair is the token response returned by login and refresh.
type Pair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // seconds until access token expires
}
