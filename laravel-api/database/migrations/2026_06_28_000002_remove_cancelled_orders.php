<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 先归档取消订单，避免不可逆删除导致无法审计/回滚
        if (! Schema::hasTable('orders_cancelled_archive')) {
            Schema::create('orders_cancelled_archive', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('order_id')->unique();
                $table->longText('order_snapshot');
                $table->timestamp('archived_at')->nullable();
                $table->timestamps();
            });
        }

        DB::table('orders')
            ->where('status', 'cancelled')
            ->chunkById(200, function ($rows): void {
                $archiveRows = [];
                foreach ($rows as $row) {
                    $snapshot = (array) $row;
                    $archiveRows[] = [
                        'order_id' => (int) ($snapshot['id'] ?? 0),
                        'order_snapshot' => json_encode($snapshot, JSON_UNESCAPED_UNICODE),
                        'archived_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }

                if ($archiveRows !== []) {
                    DB::table('orders_cancelled_archive')->upsert(
                        $archiveRows,
                        ['order_id'],
                        ['order_snapshot', 'archived_at', 'updated_at']
                    );
                }
            });

        DB::table('orders')->where('status', 'cancelled')->delete();
    }

    public function down(): void
    {
        if (! Schema::hasTable('orders_cancelled_archive')) {
            return;
        }

        // 从归档表恢复被迁移删除的取消订单
        DB::table('orders_cancelled_archive')
            ->chunkById(200, function ($rows): void {
                $restoreRows = [];
                foreach ($rows as $row) {
                    $snapshot = json_decode((string) $row->order_snapshot, true);
                    if (! is_array($snapshot) || ! isset($snapshot['id'])) {
                        continue;
                    }
                    $orderId = (int) $snapshot['id'];
                    if ($orderId <= 0) {
                        continue;
                    }
                    $exists = DB::table('orders')->where('id', $orderId)->exists();
                    if (! $exists) {
                        $restoreRows[] = $snapshot;
                    }
                }

                if ($restoreRows !== []) {
                    DB::table('orders')->insert($restoreRows);
                }
            });

        Schema::dropIfExists('orders_cancelled_archive');
    }
};
