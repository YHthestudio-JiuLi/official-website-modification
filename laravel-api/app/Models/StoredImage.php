<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** 商品图片 BLOB 存储（与现有 images 表一致） */
class StoredImage extends Model
{
    protected $table = 'images';

    public $timestamps = false;

    const CREATED_AT = 'created_at';

    protected $fillable = [
        'filename',
        'mime',
        'data',
        'size',
    ];

    protected $hidden = [
        'data',
    ];
}
