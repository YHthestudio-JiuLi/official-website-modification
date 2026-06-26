<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PopupNotice extends Model
{
    protected $table = 'popup_notices';

    protected $fillable = ['title', 'content', 'enabled', 'popup_enabled', 'display_enabled'];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'popup_enabled' => 'boolean',
            'display_enabled' => 'boolean',
        ];
    }
}
