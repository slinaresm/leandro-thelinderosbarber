<?php

namespace App\Security;

use Symfony\Component\HttpKernel\Exception\HttpException;

class CsrfTokens
{
    public function assertConfigured(): void
    {
        $this->key();
    }

    public function issue(?string $session): string
    {
        $data = bin2hex(random_bytes(24)).'.'.(time() + config('jwt.ttl'));

        return $data.'.'.hash_hmac('sha256', $data.'.'.hash('sha256', $session ?? ''), $this->key());
    }

    public function valid(string $token, ?string $session): bool
    {
        if (! preg_match('/^([a-f0-9]{48})\.(\d{10})\.([a-f0-9]{64})$/', $token, $parts)) {
            return false;
        }
        if ((int) $parts[2] <= time() || (int) $parts[2] > time() + config('jwt.ttl')) {
            return false;
        }

        return hash_equals(hash_hmac('sha256', $parts[1].'.'.$parts[2].'.'.hash('sha256', $session ?? ''), $this->key()), $parts[3]);
    }

    private function key(): string
    {
        $key = config('app.key');
        if (! is_string($key) || ! str_starts_with($key, 'base64:') || strlen(base64_decode(substr($key, 7), true) ?: '') < 32) {
            throw new HttpException(503);
        }

        return base64_decode(substr($key, 7), true);
    }
}
