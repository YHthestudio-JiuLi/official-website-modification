<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_settings')) {
            return;
        }

        Schema::table('payment_settings', function (Blueprint $table) {
            if (! Schema::hasColumn('payment_settings', 'txVerifyMaxUnderpayUsdt')) {
                $table->decimal('txVerifyMaxUnderpayUsdt', 10, 2)->default(5)->after('autoDeleteMinutes');
            }
            if (! Schema::hasColumn('payment_settings', 'txVerifyMaxAgeHours')) {
                $table->unsignedInteger('txVerifyMaxAgeHours')->default(2)->after('txVerifyMaxUnderpayUsdt');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('payment_settings')) {
            return;
        }

        Schema::table('payment_settings', function (Blueprint $table) {
            if (Schema::hasColumn('payment_settings', 'txVerifyMaxAgeHours')) {
                $table->dropColumn('txVerifyMaxAgeHours');
            }
            if (Schema::hasColumn('payment_settings', 'txVerifyMaxUnderpayUsdt')) {
                $table->dropColumn('txVerifyMaxUnderpayUsdt');
            }
        });
    }
};
