<?php

namespace App\Http\Controllers;

use App\Files\ClientDocuments;
use App\Files\PrivatePhotos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;

class PhotoController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->only(['client_id', 'reservation_id', 'type']);
        abort_if(Validator::make($data, ['client_id' => ['required', 'string', 'max:191'], 'reservation_id' => ['nullable', 'string', 'max:191'], 'type' => ['required', 'in:antes,despues']])->fails(), 400);
        abort_unless(array_keys($request->allFiles()) === ['photo'] && $request->file('photo') instanceof UploadedFile, 400);
        DB::transaction(fn () => app(ClientDocuments::class)->forWrite($request->attributes->get('identity')['user'], $data['client_id'], $data['reservation_id'] ?? null), 3);
        $files = app(PrivatePhotos::class);
        $prepared = $files->prepare($request->file('photo'));
        $files->stage($prepared);
        $photo = DB::transaction(function () use ($request, $data, $prepared): object {
            $barber = app(ClientDocuments::class)->forWrite($request->attributes->get('identity')['user'], $data['client_id'], $data['reservation_id'] ?? null);
            $staging = DB::table('photo_file_jobs')->where('disk', 'managed')->where('filename', $prepared['filename'])->lockForUpdate()->first();
            abort_unless($staging && $staging->state === 'staged', 409);
            $id = (string) Str::uuid();
            DB::table('haircut_photos')->insert(['id' => $id, 'barber_id' => $barber->id, 'client_id' => $data['client_id'], 'reservation_id' => $data['reservation_id'] ?? null, 'photo_url' => '/uploads/haircuts/'.$prepared['filename'], 'type' => $data['type']]);
            DB::table('photo_file_jobs')->where('id', $staging->id)->update(['state' => 'owned']);

            return DB::table('haircut_photos')->find($id);
        }, 3);

        return response()->json(['photo' => $photo], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->attributes->get('identity')['user'];
        $clientId = $request->query('clientId');
        abort_if($clientId !== null && (! is_string($clientId) || $clientId === '' || strlen($clientId) > 191), 400);
        if ($user->role === 'cliente') {
            $own = DB::table('clients')->where('user_id', $user->id)->value('id');
            abort_unless($own && ($clientId === null || $clientId === $own), 403);
            $clientId = $own;
        }
        abort_unless(is_string($clientId) && $clientId !== '', 400);
        $query = DB::table('haircut_photos as p')->join('barbers as b', 'b.id', '=', 'p.barber_id')->join('users as ub', 'ub.id', '=', 'b.user_id')->where('p.client_id', $clientId);
        if ($user->role === 'barbero') {
            $query->where('b.user_id', $user->id);
        }

        return response()->json(['photos' => $query->orderByDesc('p.created_at')->orderBy('p.id')->get(['p.*', 'ub.name as barber_name'])]);
    }

    public function destroy(Request $request, string $id): Response
    {
        DB::transaction(function () use ($request, $id): void {
            $photo = DB::table('haircut_photos')->where('id', $id)->lockForUpdate()->first();
            abort_unless($photo, 404);
            $user = $request->attributes->get('identity')['user'];
            abort_unless($user->role === 'admin' || ($user->role === 'barbero' && DB::table('barbers')->where('id', $photo->barber_id)->where('user_id', $user->id)->exists()), 403);
            $name = $this->filename($photo->photo_url);
            $location = app(PrivatePhotos::class)->locate($name);
            $known = DB::table('photo_file_jobs')->where('filename', $name)->where('state', 'owned')->first();
            $disk = $location['disk'] ?? $known->disk ?? 'legacy';
            DB::table('photo_file_jobs')->upsert([['filename' => $name, 'disk' => $disk, 'state' => 'delete', 'created_at' => now('UTC')->format('Y-m-d H:i:s.u')]], ['disk', 'filename'], ['state']);
            DB::table('haircut_photos')->where('id', $id)->delete();
        }, 3);

        return response()->noContent();
    }

    public function content(Request $request, string $filename): BinaryFileResponse
    {
        $files = app(PrivatePhotos::class);
        abort_unless($files->validName($filename), 404);
        $photos = DB::table('haircut_photos')->where('photo_url', '/uploads/haircuts/'.$filename)->get();
        $allowed = $photos->contains(fn (object $photo) => app(ClientDocuments::class)->canReadPhoto($request->attributes->get('identity')['user'], $photo));
        abort_unless($allowed, 404);
        $location = $files->locate($filename);
        abort_unless($location, 404);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($location['path']);
        $info = @getimagesize($location['path']);
        abort_unless(in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) && $info && ($info['mime'] ?? null) === $mime, 404);

        return response()->file($location['path'], ['Content-Type' => $mime, 'Content-Disposition' => 'inline; filename="'.$filename.'"']);
    }

    private function filename(string $url): string
    {
        $prefix = '/uploads/haircuts/';
        abort_unless(str_starts_with($url, $prefix), 409);
        $name = substr($url, strlen($prefix));
        abort_unless(app(PrivatePhotos::class)->validName($name), 409);

        return $name;
    }
}
