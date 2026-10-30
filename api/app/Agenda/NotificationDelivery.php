<?php

namespace App\Agenda;

use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Throwable;

class NotificationDelivery
{
    /** @return array{state:string,code:string} */
    public function send(object $job, object $user): array
    {
        $mode = config('notifications.'.($job->channel === 'email' ? 'email' : 'whatsapp').'_mode');
        if ($mode === 'simulate') {
            return ['state' => 'simulated', 'code' => 'simulation'];
        }
        if ($mode === 'disabled') {
            return ['state' => 'unavailable', 'code' => 'channel_disabled'];
        }
        $payload = json_decode($job->payload, true, flags: JSON_THROW_ON_ERROR);
        if ($job->channel === 'email' && $mode === 'smtp') {
            $smtp = config('notifications.smtp');
            if (! ($smtp['host'] && $smtp['username'] && $smtp['password']) || ! filter_var($smtp['from'], FILTER_VALIDATE_EMAIL) || ! in_array($smtp['scheme'], ['smtp', 'smtps'], true) || $smtp['port'] < 1 || $smtp['port'] > 65535) {
                return ['state' => 'unavailable', 'code' => 'smtp_configuration'];
            }
            if (! filter_var($user->email, FILTER_VALIDATE_EMAIL)) {
                return ['state' => 'failed', 'code' => 'recipient_invalid'];
            }
            config(['mail.mailers.notifications-smtp' => ['transport' => 'smtp', 'host' => $smtp['host'], 'port' => $smtp['port'], 'scheme' => $smtp['scheme'], 'username' => $smtp['username'], 'password' => $smtp['password'], 'timeout' => 15, 'require_tls' => true]]);
            try {
                Mail::purge('notifications-smtp');
                Mail::mailer('notifications-smtp')->raw('Hola '.$payload['name'].".\n".$payload['subject'].".\n".$payload['detail']."\n".$payload['when'], function (Message $message) use ($user, $payload, $smtp): void {
                    $message->to($user->email)->from($smtp['from'], 'Barber Linderos')->subject($payload['subject']);
                });

                return ['state' => 'sent', 'code' => 'provider_accepted'];
            } catch (Throwable) {
                return ['state' => 'uncertain', 'code' => 'smtp_outcome_unknown'];
            }
        }
        if ($job->channel !== 'whatsapp' || $mode !== 'cloud') {
            return ['state' => 'unavailable', 'code' => 'channel_configuration'];
        }
        $wa = config('notifications.whatsapp');
        $template = $wa['templates'][$job->type] ?? null;
        if (! $wa['token'] || ! preg_match('/^[0-9]{5,32}$/D', (string) $wa['phone_id']) || ! preg_match('/^v[0-9]{1,3}\.0$/D', (string) $wa['version']) || ! preg_match('/^[a-z0-9_]{1,100}$/D', (string) $template) || ! preg_match('/^[a-z]{2}(?:_[A-Z]{2})?$/D', (string) $wa['language'])) {
            return ['state' => 'unavailable', 'code' => 'whatsapp_configuration'];
        }
        $phone = preg_replace('/[ +()\-]/', '', $user->phone ?? '');
        if (! preg_match('/^[1-9][0-9]{7,14}$/D', $phone)) {
            return ['state' => 'failed', 'code' => 'recipient_invalid'];
        }
        try {
            $response = Http::withToken($wa['token'])->timeout(15)->connectTimeout(5)->withoutRedirecting()->post('https://graph.facebook.com/'.$wa['version'].'/'.$wa['phone_id'].'/messages', [
                'messaging_product' => 'whatsapp', 'to' => $phone, 'type' => 'template',
                'template' => ['name' => $template, 'language' => ['code' => $wa['language']], 'components' => [['type' => 'body', 'parameters' => array_map(fn (string $value): array => ['type' => 'text', 'text' => $value], [$payload['name'], $payload['detail'], $payload['when']])]]],
            ]);
            if ($response->successful() && is_string($response->json('messages.0.id')) && $response->json('messages.0.id') !== '') {
                return ['state' => 'sent', 'code' => 'provider_accepted'];
            }
            if ($response->status() === 429) {
                return ['state' => 'retry', 'code' => 'provider_rate_limited'];
            }
            if ($response->clientError()) {
                return ['state' => 'failed', 'code' => 'provider_rejected'];
            }

            return ['state' => 'uncertain', 'code' => 'provider_outcome_unknown'];
        } catch (Throwable) {
            return ['state' => 'uncertain', 'code' => 'provider_outcome_unknown'];
        }
    }
}
