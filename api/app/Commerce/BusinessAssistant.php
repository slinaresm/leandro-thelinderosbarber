<?php

namespace App\Commerce;

use Illuminate\Support\Facades\DB;

class BusinessAssistant
{
    public function __construct(private GeminiGateway $gateway) {}

    /** @param array<string,mixed> $input
     * @return array{reply:string,simulated:bool}
     */
    public function chat(array $input): array
    {
        abort_unless(array_keys($input) === ['messages'], 400);
        $messages = $input['messages'];
        abort_unless(is_array($messages) && array_is_list($messages) && count($messages) > 0 && count($messages) <= 20, 400);
        $contents = [];
        foreach ($messages as $message) {
            abort_unless(is_array($message) && count($message) === 2 && isset($message['role'], $message['content']) && in_array($message['role'], ['user', 'assistant'], true) && is_string($message['content']) && trim($message['content']) !== '' && mb_strlen($message['content']) <= 800 && ! preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', $message['content']), 400);
            $text = preg_replace('/[^\s@]+@[^\s@]+\.[^\s@]+/u', '[correo omitido]', $message['content']);
            $text = preg_replace('/(?<![\p{L}\d])\+?\d[\d ()-]{6,}\d(?![\p{L}\d])/u', '[teléfono omitido]', $text);
            $contents[] = ['role' => $message['role'] === 'user' ? 'user' : 'model', 'parts' => [['text' => $text]]];
        }
        abort_unless(end($messages)['role'] === 'user', 400);
        $mode = $this->gateway->mode();
        $public = $this->context();
        if ($mode === 'simulate') {
            $lines = array_map(fn (array $service): string => $service['name'].': $'.$service['price'].' ('.$service['duration_minutes'].' min)', $public['services']);

            return ['reply' => 'Modo simulado. Servicios vigentes: '.($lines ? implode('; ', $lines) : 'sin servicios cargados').'. Para consultar disponibilidad o reservar, usa Reservar ahora.', 'simulated' => true];
        }

        return ['reply' => $this->gateway->chat(json_encode($public, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $contents), 'simulated' => false];
    }

    /** @return array<string,mixed> */
    private function context(): array
    {
        $services = DB::table('services')->where('active', 1)->orderBy('name')->orderBy('id')->limit(20)->get(['name', 'price', 'duration_minutes', 'description'])->map(fn (object $row): array => ['name' => mb_substr($row->name, 0, 120), 'price' => $row->price, 'duration_minutes' => $row->duration_minutes, 'description' => mb_substr($row->description ?? '', 0, 200)])->all();
        $barbers = DB::table('barbers as b')->join('users as u', 'u.id', '=', 'b.user_id')->where('b.active', 1)->whereNull('u.deleted_at')->orderBy('u.name')->orderBy('b.id')->limit(20)->get(['u.name', 'b.specialty', 'b.work_start', 'b.work_end'])->map(fn (object $row): array => ['name' => mb_substr($row->name, 0, 100), 'specialty' => mb_substr($row->specialty ?? '', 0, 100), 'work_start' => $row->work_start, 'work_end' => $row->work_end])->all();
        $products = DB::table('products')->where('active', 1)->orderBy('name')->orderBy('id')->limit(20)->get(['name', 'price', 'stock'])->map(fn (object $row): array => ['name' => mb_substr($row->name, 0, 120), 'price' => $row->price, 'in_stock' => $row->stock > 0])->all();

        return ['services' => $services, 'barbers' => $barbers, 'products' => $products, 'timezone' => 'America/Santiago', 'catalogLimited' => true, 'booking' => 'Usar Reservar ahora; disponibilidad real no se consulta desde el chat.', 'loyalty' => 'Se acreditan diez puntos por visita completada. Los beneficios efectivos se consultan en la cuenta; el chat no accede a puntos individuales.'];
    }
}
