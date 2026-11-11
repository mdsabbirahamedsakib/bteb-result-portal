<?php
/**
 * BTEB Portal - Optional MySQL Database Configuration (api/db_config.php)
 *
 * For cPanel / PHP / MySQL hosting:
 * Copy overrides into api/db_config.local.php (gitignored) or edit values here
 * on your server only. Never commit production passwords to public GitHub repos.
 */

$config = [
    'host'          => 'localhost',
    'port'          => '3306',
    'dbname'        => '',
    'username'      => '',
    'password'      => '',
    'charset'       => 'utf8mb4',
    // Set a non-empty secret key in db_config.local.php before exposing admin log queries/clear
    'admin_api_key' => '',
    // Optional: set true only behind a trusted reverse proxy (e.g. Cloudflare/Nginx)
    'trust_proxy'   => false,
    'timezone'      => 'Asia/Dhaka'
];

$localOverride = __DIR__ . '/db_config.local.php';
if (file_exists($localOverride)) {
    $override = require $localOverride;
    if (is_array($override)) {
        $config = array_merge($config, $override);
    }
}

return $config;
