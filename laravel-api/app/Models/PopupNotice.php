<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PopupNotice extends Model
{
    protected $table = 'popup_notices';

    protected $fillable = ['title', 'content', 'enabled'];

    protected function casts(): array
    {
        return ['enabled' => 'boolean'];
    }
}
