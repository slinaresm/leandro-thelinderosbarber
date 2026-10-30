<?php

namespace App\Http\Controllers;

use App\Commerce\Amounts;
use App\Commerce\AuditTrail;
use App\Commerce\CommercialMetrics;
use App\Events\AgendaEvents;
use App\Files\CatalogImages;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ProductController extends Controller
{
    public function movements(Request $request): JsonResponse
    {
        abort_if(array_diff(array_keys($request->query()), ['productId', 'page', 'pageSize']) !== [], 400);
        $page = Amounts::integer($request->query('page', 1));
        $size = Amounts::integer($request->query('pageSize', 50));
        abort_if($page < 1 || $page > 1000000 || $size < 1 || $size > 100, 400);
        $productId = $request->query('productId');
        abort_if($productId !== null && (! is_string($productId) || $productId === '' || strlen($productId) > 191), 400);
        $query = DB::table('stock_movements as m')->leftJoin('products as p', 'p.id', '=', 'm.product_id')->leftJoin('users as u', 'u.id', '=', 'm.created_by');
        if ($productId !== null) {
            $query->where('m.product_id', $productId);
        }
        $total = (clone $query)->count();
        $rows = $query->orderByDesc('m.created_at')->orderBy('m.id')->offset(($page - 1) * $size)->limit($size)->get(['m.id', 'm.product_id', 'p.name as product_name', 'm.movement_type', 'm.quantity_delta', 'm.unit_cost', 'm.reference_type', 'm.reference_id', 'u.name as actor_name', 'm.created_at']);
        foreach ($rows as $row) {
            $row->quantity_delta = (int) $row->quantity_delta;
            $row->unit_cost = $row->unit_cost === null ? null : (int) $row->unit_cost;
        }

        return response()->json(['movements' => $rows, 'total' => $total, 'page' => $page, 'pageSize' => $size, 'totalPages' => max(1, (int) ceil($total / $size))]);
    }

    private const PUBLIC_FIELDS = ['p.id', 'p.name', 'p.description', 'p.price', 'p.image_url', 'p.stock', 'p.category', 'p.active', 'p.created_at', 'p.updated_at'];

    private const SORT = ['relevancia' => 'p.active DESC, p.created_at DESC', 'mas_vendidos' => 'sold DESC, p.created_at DESC', 'alfabetico_az' => 'p.name ASC', 'alfabetico_za' => 'p.name DESC', 'precio_asc' => 'p.price ASC', 'precio_desc' => 'p.price DESC', 'fecha_antiguo' => 'p.created_at ASC', 'fecha_reciente' => 'p.created_at DESC'];

    public function index(Request $request): JsonResponse
    {
        $data = $request->query();
        $repeated = [];
        foreach (explode('&', $request->server('QUERY_STRING', '')) as $part) {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
            if (in_array(rawurldecode($key), ['availability', 'availability[]'], true)) {
                $repeated[] = rawurldecode($value);
            }
        }
        $availability = $repeated ?: ($data['availability'] ?? []);
        $availability = is_array($availability) ? $availability : [$availability];
        abort_if(! array_is_list($availability) || count($availability) > 2, 400);
        foreach ($availability as $value) {
            abort_unless(is_string($value) && in_array($value, ['in_stock', 'out_of_stock'], true), 400);
        }
        $page = Amounts::integer($data['page'] ?? 1);
        $size = Amounts::integer($data['pageSize'] ?? 24);
        abort_if($page < 1 || $page > 1000000 || $size < 1 || $size > 100, 400);
        $sort = $data['sort'] ?? 'relevancia';
        abort_unless(is_string($sort) && isset(self::SORT[$sort]), 400);
        $min = isset($data['minPrice']) ? Amounts::integer($data['minPrice']) : null;
        $max = isset($data['maxPrice']) ? Amounts::integer($data['maxPrice']) : null;
        abort_if($min !== null && $max !== null && $min > $max, 400);
        $query = DB::table('products as p')->leftJoinSub(app(CommercialMetrics::class)->sales(), 'sales', 'sales.product_id', '=', 'p.id')->where('p.active', 1);
        if ($min !== null) {
            $query->where('p.price', '>=', $min);
        }
        if ($max !== null) {
            $query->where('p.price', '<=', $max);
        }
        if (count(array_unique($availability)) === 1) {
            $availability[0] === 'in_stock' ? $query->where('p.stock', '>', 0) : $query->where('p.stock', '<=', 0);
        }
        $total = (clone $query)->count();
        $rows = $query->select(self::PUBLIC_FIELDS)->selectRaw("CASE WHEN p.stock > 0 THEN 'in_stock' ELSE 'out_of_stock' END AS availability, COALESCE(sales.sold,0) AS sold")->orderByRaw(self::SORT[$sort])->orderBy('p.id')->offset(($page - 1) * $size)->limit($size)->get();
        foreach ($rows as $row) {
            $row->sold = Amounts::integer($row->sold, 409);
        }
        $active = DB::table('products')->where('active', 1);

        return response()->json(['products' => $rows, 'total' => $total, 'page' => $page, 'pageSize' => $size, 'totalPages' => max((int) ceil($total / $size), 1), 'facets' => ['inStockCount' => (clone $active)->where('stock', '>', 0)->count(), 'outOfStockCount' => (clone $active)->where('stock', '<=', 0)->count(), 'maxPrice' => (clone $active)->max('price') ?? 0]]);
    }

    public function show(string $id): JsonResponse
    {
        $product = DB::table('products as p')->where('p.id', $id)->where('p.active', 1)->first(self::PUBLIC_FIELDS);
        abort_unless($product, 404);

        return response()->json(['product' => $product]);
    }

    public function all(): JsonResponse
    {
        return response()->json(['products' => DB::table('products')->orderByDesc('created_at')->orderBy('id')->get()]);
    }

    public function summary(): JsonResponse
    {
        $units = $cost = $retail = $missing = 0;
        foreach (DB::table('products')->where('active', 1)->get() as $product) {
            $stock = Amounts::integer($product->stock, 409);
            $units = Amounts::add($units, $stock, 409);
            $retail = Amounts::add($retail, Amounts::multiply((int) $product->price, $stock, 409), 409);
            if ($product->cost_price === null) {
                $missing++;
            } else {
                $cost = Amounts::add($cost, Amounts::multiply((int) $product->cost_price, $stock, 409), 409);
            }
        }

        return response()->json(['unitsInStock' => $units, 'stockValueCost' => $cost, 'stockValueRetail' => $retail, 'potentialProfit' => $retail - $cost, 'productsMissingCost' => $missing]);
    }

    /** @return array<string, mixed> */
    private function input(Request $request, bool $create): array
    {
        $data = $request->only(['name', 'description', 'price', 'cost_price', 'stock', 'category', 'active', 'image_url']);
        if (is_string($data['name'] ?? null)) {
            $data['name'] = trim($data['name']);
        }
        abort_if(Validator::make($data, ['name' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:200', 'not_regex:/[<>]/'], 'description' => ['sometimes', 'nullable', 'string', 'max:10000'], 'category' => ['sometimes', 'nullable', 'string', 'max:200'], 'price' => [$create ? 'required' : 'sometimes'], 'active' => ['sometimes', 'boolean'], 'image_url' => ['sometimes', 'nullable', 'string', 'max:2048']])->fails(), 400);
        foreach (['price', 'cost_price', 'stock'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = $field === 'cost_price' && $data[$field] === null ? null : Amounts::integer($data[$field]);
            }
        }
        if (isset($data['image_url'])) {
            abort_unless(preg_match('~^(?:https://[^\s<>]+|/assets/[A-Za-z0-9_./-]+|/uploads/products/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))$~D', $data['image_url']) && ! str_contains($data['image_url'], '..'), 400);
        }

        return $data;
    }

    /** @return array{filename:string,bytes:string}|null */
    private function imageInput(Request $request): ?array
    {
        if ($request->allFiles() === []) {
            return null;
        }
        abort_unless(array_keys($request->allFiles()) === ['image'] && $request->file('image') instanceof UploadedFile, 400);
        $files = app(CatalogImages::class);
        $prepared = $files->prepare($request->file('image'));
        $files->stage($prepared);

        return $prepared;
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->input($request, true);
        $image = $this->imageInput($request);
        $product = DB::transaction(function () use ($request, $data, $image): object {
            $id = (string) Str::uuid();
            if ($image) {
                $data['image_url'] = '/uploads/products/'.$image['filename'];
                app(CatalogImages::class)->own($image['filename']);
            }
            DB::table('products')->insert(['id' => $id, 'stock' => 0, 'active' => 1, ...$data]);
            $product = DB::table('products')->find($id);
            if ($product->stock > 0) {
                app(AuditTrail::class)->movement($id, (int) $product->stock, $product->cost_price, 'product_create', $id, $request->user()->id);
            }
            app(AuditTrail::class)->record($request->user()->id, 'product', $id, 'created', null, $product);
            app(AgendaEvents::class)->catalog();

            return $product;
        }, 3);

        return response()->json(['product' => $product], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $data = $this->input($request, false);
        $image = $this->imageInput($request);
        $product = DB::transaction(function () use ($request, $id, $data, $image): object {
            $before = DB::table('products')->where('id', $id)->lockForUpdate()->first();
            abort_unless($before, 404);
            if ($image) {
                $data['image_url'] = '/uploads/products/'.$image['filename'];
                app(CatalogImages::class)->own($image['filename']);
            }
            if ($data !== []) {
                DB::table('products')->where('id', $id)->update([...$data, 'updated_at' => now('UTC')->format('Y-m-d H:i:s.u')]);
            }
            $after = DB::table('products')->find($id);
            if ($after->image_url !== $before->image_url) {
                app(CatalogImages::class)->release($before->image_url);
            }
            if ($after->stock !== $before->stock) {
                app(AuditTrail::class)->movement($id, (int) $after->stock - (int) $before->stock, $after->cost_price, 'product_update', $id, $request->user()->id);
            }
            app(AuditTrail::class)->record($request->user()->id, 'product', $id, 'updated', $before, $after);
            app(AgendaEvents::class)->catalog();

            return $after;
        }, 3);

        return response()->json(['product' => $product]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        DB::transaction(function () use ($request, $id): void {
            $before = DB::table('products')->where('id', $id)->lockForUpdate()->first();
            abort_unless($before, 404);
            DB::table('products')->where('id', $id)->update(['active' => 0]);
            $after = clone $before;
            $after->active = 0;
            app(AuditTrail::class)->record($request->user()->id, 'product', $id, 'deactivated', $before, $after);
            app(AgendaEvents::class)->catalog();
        }, 3);

        return response()->json(['message' => 'Producto desactivado.']);
    }

    public function image(string $filename): BinaryFileResponse
    {
        $images = app(CatalogImages::class);
        abort_unless($images->validName($filename) && DB::table('products')->where('image_url', '/uploads/products/'.$filename)->where('active', 1)->exists(), 404);
        $location = $images->locate($filename);
        abort_unless($location, 404);
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($location['path']);
        $info = @getimagesize($location['path']);
        abort_unless(in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true) && $info && ($info['mime'] ?? null) === $mime, 404);

        return response()->file($location['path'], ['Content-Type' => $mime, 'Content-Disposition' => 'inline; filename="'.$filename.'"']);
    }
}
