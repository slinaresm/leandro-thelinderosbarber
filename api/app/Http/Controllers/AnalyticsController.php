<?php

namespace App\Http\Controllers;

use App\Commerce\BusinessMetrics;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    public function overview(Request $request, BusinessMetrics $metrics): JsonResponse
    {
        return response()->json($metrics->overview($request->query()));
    }
}
