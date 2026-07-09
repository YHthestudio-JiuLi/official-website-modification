<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

/**
 * 对接现有 users 表（username / isAdmin / bcrypt password）
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, HasRoles, Notifiable;

    /** Spatie 角色/权限统一使用 web guard 定义，与 admin 登录 guard 无关 */
    protected $guard_name = 'web';

    protected $table = 'users';

    public $timestamps = false;

    protected $fillable = [
        'username',
        'email',
        'password',
        'isAdmin',
        'user_type',
        'status',
        'createdAt',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'isAdmin' => 'boolean',
            'createdAt' => 'datetime',
        ];
    }

    public function agent(): HasOne
    {
        return $this->hasOne(Agent::class, 'user_id');
    }

    public function isSuperAdmin(): bool
    {
        if ($this->hasRole('super_admin')) {
            return true;
        }
        // 历史账号仅 isAdmin=1、尚未挂 Spatie 角色时仍视为超管
        if (! $this->roles()->exists()) {
            return (bool) $this->isAdmin;
        }

        return false;
    }

    public function canAccessAdmin(): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        // 纯 customer 角色不得进入后台（即使历史 isAdmin=1）
        if ($this->hasRole('customer')
            && ! $this->hasAnyRole(['super_admin', 'staff', 'agent'])) {
            return false;
        }

        return $this->can('admin.access');
    }

    /** 开通代理：users 表中没有 agents 记录、且非超级管理员的用户 */
    public function scopeEligibleForAgent(Builder $query): Builder
    {
        return $query
            ->whereDoesntHave('agent')
            ->where('isAdmin', 0)
            ->whereDoesntHave('roles', fn (Builder $rq) => $rq->where('name', 'super_admin'));
    }
}
