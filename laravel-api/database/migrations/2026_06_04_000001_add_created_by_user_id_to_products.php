<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('products')) {
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            if (! Schema::hasColumn('products', 'createdByUserId')) {
                $table->unsignedBigInteger('createdByUserId')->nullable()->after('subCategoryId');
                $table->index('createdByUserId', 'idx_products_created_by');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('products')) {
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            if (Schema::hasColumn('products', 'createdByUserId')) {
                $table->dropIndex('idx_products_created_by');
                $table->dropColumn('createdByUserId');
            }
        });
    }
};
