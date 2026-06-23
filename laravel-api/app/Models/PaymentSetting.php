<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentSetting extends Model
{
    protected $table = 'payment_settings';

    public $timestamps = false;

    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'wallet_address',
        'network',
        'autoDeleteMinutes',
        'txVerifyMaxUnderpayUsdt',
        'txVerifyMaxAgeHours',
    ];

    protected $casts = [
        'txVerifyMaxUnderpayUsdt' => 'float',
        'txVerifyMaxAgeHours' => 'integer',
    ];
}
