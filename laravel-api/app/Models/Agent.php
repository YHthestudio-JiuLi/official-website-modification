<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * 代理账户：树形上下级，用于数据范围隔离
 */
class Agent extends Model
{
    protected $fillable = [
        'user_id',
        'parent_id',
        'commission_rate',
        'region',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'commission_rate' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Agent::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Agent::class, 'parent_id');
    }

    /** 收集自身及所有下级代理 ID（含自身 user_id） */
    public function descendantUserIds(): array
    {
        $ids = [$this->user_id];
        $queue = [$this->id];

        while ($queue) {
            $currentId = array_shift($queue);
            $children = static::query()->where('parent_id', $currentId)->get(['id', 'user_id']);
            foreach ($children as $child) {
                $ids[] = $child->user_id;
                $queue[] = $child->id;
            }
        }

        return array_values(array_unique($ids));
    }
}
