<?php

namespace App\Http\Controllers;

use App\Commerce\PublicBusinessConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicConfigController extends Controller
{
    public function index(Request $request, PublicBusinessConfig $config): JsonResponse
    {
        abort_if($request->query() !== [], 400);

        return response()->json($config->view());
    }
}
