<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ForumReply extends Model
{
    protected $table = 'forum_replies';

    public $timestamps = false;

    const CREATED_AT = 'createdAt';

    protected $fillable = ['postId', 'author', 'content', 'parentReplyId'];
}
