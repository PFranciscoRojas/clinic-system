package db

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// ConnectRedis creates a Redis client and verifies the connection with PING.
func ConnectRedis(addr, password string) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           0,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 2,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		client.Close()
		return nil, fmt.Errorf("redis: failed to ping: %w", err)
	}

	return client, nil
}
