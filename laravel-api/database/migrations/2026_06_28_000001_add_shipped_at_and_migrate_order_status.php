<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('orders', 'shippedAt')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('shippedAt', 40)->nullable()->after('paidAt');
            });
        }

        // 历史「已完成」统一为「已签收」
        DB::table('orders')->where('status', 'completed')->update(['status' => 'delivered']);
    }

    public function down(): void
    {
        DB::table('orders')->where('status', 'delivered')->update(['status' => 'completed']);

        if (Schema::hasColumn('orders', 'shippedAt')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropColumn('shippedAt');
            });
        }
    }
};
