<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ForumPost extends Model
{
    protected $table = 'forum_posts';

    public $timestamps = false;

    const CREATED_AT = 'createdAt';

    protected $fillable = ['title', 'author', 'content', 'date', 'replies', 'isPinned'];

    protected function casts(): array
    {
        return ['isPinned' => 'boolean', 'replies' => 'integer'];
    }
}
