<?php

namespace App\Commerce;

class PublicBusinessConfig
{
    /** @return array{whatsappBusinessNumber:string,whatsappCloudApiEnabled:bool} */
    public function view(): array
    {
        $raw = config('business.whatsapp_business_number');
        abort_unless(is_string($raw) && preg_match('/^[0-9 +()\-]*$/D', $raw), 503);
        $number = preg_replace('/[ +()\-]/', '', $raw);
        abort_unless($number === '' || preg_match('/^[1-9][0-9]{7,14}$/D', $number), 503);
        $wa = config('notifications.whatsapp');
        $enabled = is_array($wa) && config('notifications.whatsapp_mode') === 'cloud' && is_string($wa['token'] ?? null) && $wa['token'] !== '';
        foreach (['phone_id' => '/^[0-9]{5,32}$/D', 'version' => '/^v[0-9]{1,3}\.0$/D', 'language' => '/^[a-z]{2}(?:_[A-Z]{2})?$/D'] as $field => $pattern) {
            $enabled = $enabled && is_string($wa[$field] ?? null) && preg_match($pattern, $wa[$field]);
        }
        foreach (['confirmacion', 'recordatorio_24h', 'recordatorio_2h'] as $type) {
            $enabled = $enabled && is_array($wa['templates'] ?? null) && is_string($wa['templates'][$type] ?? null) && preg_match('/^[a-z0-9_]{1,100}$/D', $wa['templates'][$type]);
        }

        return ['whatsappBusinessNumber' => $number, 'whatsappCloudApiEnabled' => (bool) $enabled];
    }
}
