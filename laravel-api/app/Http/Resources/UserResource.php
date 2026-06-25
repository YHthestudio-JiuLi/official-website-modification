<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** 用户 API 响应：永不返回 password */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'email' => $this->email,
            'user_type' => $this->user_type ?? 'customer',
            'status' => $this->status ?? 'active',
            'isAdmin' => (bool) $this->isAdmin,
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->pluck('name')),
            'permissions' => $this->when(
                $request->user()?->id === $this->id,
                fn () => $request->attributes->get('resolved_permissions')
                    ?? $this->getAllPermissions()->pluck('name')
            ),
            'agent' => $this->whenLoaded('agent', fn () => [
                'id' => $this->agent->id,
                'parent_id' => $this->agent->parent_id,
                'commission_rate' => $this->agent->commission_rate,
                'region' => $this->agent->region,
                'status' => $this->agent->status,
            ]),
            'createdAt' => $this->createdAt,
        ];
    }
}
