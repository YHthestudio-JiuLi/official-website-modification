<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('username')->unique();
                $table->string('email')->unique();
                $table->string('password');
                $table->boolean('isAdmin')->default(false);
                $table->string('user_type', 32)->default('customer');
                $table->string('status', 32)->default('active');
                $table->rememberToken()->nullable();
                $table->timestamp('createdAt')->useCurrent();
            });

            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'user_type')) {
                $table->string('user_type', 32)->default('customer')->after('isAdmin');
            }
            if (! Schema::hasColumn('users', 'status')) {
                $table->string('status', 32)->default('active')->after('user_type');
            }
            if (! Schema::hasColumn('users', 'remember_token')) {
                $table->rememberToken()->nullable();
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'user_type')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn(['user_type', 'status', 'remember_token']);
            });
        }
    }
};
