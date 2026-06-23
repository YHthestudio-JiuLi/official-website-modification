<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Product extends Model
{
    protected $table = 'products';

    public $timestamps = false;

    const CREATED_AT = 'createdAt';

    protected $fillable = [
        'name',
        'description',
        'image',
        'date',
        'price',
        'priceUsdt',
        'featuresJson',
        'specsJson',
        'usageNoticeJson',
        'categoryId',
        'subCategoryId',
        'createdByUserId',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'float',
            'priceUsdt' => 'float',
            'categoryId' => 'integer',
            'subCategoryId' => 'integer',
            'createdByUserId' => 'integer',
            'createdAt' => 'datetime',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'categoryId');
    }

    public function subCategory(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'subCategoryId');
    }
}
