<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductCategory extends Model
{
    protected $table = 'product_categories';

    public $timestamps = false;

    const CREATED_AT = 'createdAt';

    protected $fillable = [
        'name',
        'nameEn',
        'slug',
        'parentId',
        'sortOrder',
    ];

    protected function casts(): array
    {
        return [
            'sortOrder' => 'integer',
            'parentId' => 'integer',
            'createdAt' => 'datetime',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parentId');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parentId');
    }
}
