<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('agents')) {
            return;
        }

        Schema::create('agents', function (Blueprint $table) {
            $table->id();
            // 对接现有 users.id（int unsigned）
            $table->unsignedInteger('user_id')->unique();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->decimal('commission_rate', 5, 2)->default(0);
            $table->string('region')->nullable();
            $table->string('status', 32)->default('active');
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('parent_id')->references('id')->on('agents')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('agents');
    }
};
