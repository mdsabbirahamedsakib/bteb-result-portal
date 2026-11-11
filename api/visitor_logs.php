<?php
/**
 * BTEB Portal - Optional Visitor Logs REST API (api/visitor_logs.php)
 *
 * Works with MySQL table `visitor_logs` (database/visitor_logs.sql):
 *   - POST ?action=record  : Records visitor IP, visit_date, visited_at & returns aggregate counts
 *   - GET  ?action=stats   : Returns aggregate visitor counts (publicly safe, no raw IP list)
 *   - GET  ?action=logs    : Returns paginated visitor_logs rows (requires configured admin_api_key)
 *   - POST ?action=clear   : Truncates visitor_logs table (requires configured admin_api_key)
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function sendJson(array $payload, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function getClientIpAddress(bool $trustProxy): string {
    $candidates = [];
    if ($trustProxy && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $candidates[] = $_SERVER['HTTP_CF_CONNECTING_IP'];
    }
    if ($trustProxy && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        if (!empty($parts[0])) {
            $candidates[] = trim($parts[0]);
        }
    }
    if (!empty($_SERVER['REMOTE_ADDR'])) {
        $candidates[] = $_SERVER['REMOTE_ADDR'];
    }

    foreach ($candidates as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return substr($ip, 0, 45);
        }
    }
    return '0.0.0.0';
}

function fetchVisitorStats(PDO $pdo): array {
    $sql = "
        SELECT
            COUNT(*) AS total_visits,
            COUNT(DISTINCT ip_address) AS unique_visitors,
            SUM(CASE WHEN visit_date = CURDATE() THEN 1 ELSE 0 END) AS today_visits,
            COUNT(DISTINCT CASE WHEN visit_date = CURDATE() THEN ip_address ELSE NULL END) AS today_unique
        FROM visitor_logs
    ";
    $row = $pdo->query($sql)->fetch(PDO::FETCH_ASSOC) ?: [];
    return [
        'totalVisits'    => (int)($row['total_visits'] ?? 0),
        'uniqueVisitors' => (int)($row['unique_visitors'] ?? 0),
        'todayVisits'    => (int)($row['today_visits'] ?? 0),
        'todayUnique'    => (int)($row['today_unique'] ?? 0)
    ];
}

function verifyAdminAuthorization(array $config): void {
    $configuredKey = isset($config['admin_api_key']) ? (string)$config['admin_api_key'] : '';
    if ($configuredKey === '') {
        sendJson([
            'ok' => false,
            'message' => 'Admin API key is not configured in api/db_config.local.php.'
        ], 403);
    }

    $providedKey = $_SERVER['HTTP_X_ADMIN_KEY'] ?? ($_GET['admin_key'] ?? '');
    if (!is_string($providedKey) || !hash_equals($configuredKey, $providedKey)) {
        sendJson([
            'ok' => false,
            'message' => 'Unauthorized admin API key.'
        ], 401);
    }
}

$config = require __DIR__ . '/db_config.php';
if (empty($config['dbname']) || empty($config['username'])) {
    sendJson([
        'ok'         => false,
        'configured' => false,
        'message'    => 'MySQL credentials are not configured yet.'
    ], 503);
}

try {
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $config['host'] ?? 'localhost',
        $config['port'] ?? '3306',
        $config['dbname'],
        $config['charset'] ?? 'utf8mb4'
    );
    $pdo = new PDO($dsn, $config['username'], $config['password'] ?? '', [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false
    ]);

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS visitor_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip_address VARCHAR(45) NOT NULL,
            visit_date DATE NOT NULL,
            visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_visit_date (visit_date),
            INDEX idx_ip_visit_date (ip_address, visit_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
} catch (Throwable $e) {
    sendJson([
        'ok'         => false,
        'configured' => false,
        'message'    => 'Database connection failed.'
    ], 500);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = $_GET['action'] ?? '';
if ($action === '' && $method === 'POST') {
    $rawBody = file_get_contents('php://input');
    $jsonBody = is_string($rawBody) ? json_decode($rawBody, true) : null;
    if (is_array($jsonBody) && !empty($jsonBody['action'])) {
        $action = (string)$jsonBody['action'];
    } else {
        $action = 'record';
    }
}
if ($action === '') {
    $action = 'stats';
}

if ($action === 'record' && $method === 'POST') {
    $ip = getClientIpAddress(!empty($config['trust_proxy']));
    $stmt = $pdo->prepare('INSERT INTO visitor_logs (ip_address, visit_date) VALUES (:ip, CURDATE())');
    $stmt->execute([':ip' => $ip]);

    sendJson([
        'ok'         => true,
        'configured' => true,
        'mode'       => 'mysql',
        'id'         => (int)$pdo->lastInsertId(),
        'stats'      => fetchVisitorStats($pdo)
    ]);
}

if ($action === 'stats' && $method === 'GET') {
    sendJson([
        'ok'         => true,
        'configured' => true,
        'mode'       => 'mysql',
        'stats'      => fetchVisitorStats($pdo)
    ]);
}

if ($action === 'logs' && $method === 'GET') {
    verifyAdminAuthorization($config);

    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
    if ($limit < 1) $limit = 50;
    if ($limit > 500) $limit = 500;

    $dateFilter = trim((string)($_GET['date'] ?? ''));
    $search = trim((string)($_GET['q'] ?? ''));

    $where = [];
    $params = [];

    if ($dateFilter === 'today') {
        $where[] = 'visit_date = CURDATE()';
    } elseif ($dateFilter !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFilter)) {
        $where[] = 'visit_date = :visit_date';
        $params[':visit_date'] = $dateFilter;
    }

    if ($search !== '') {
        $where[] = '(ip_address LIKE :q OR CAST(id AS CHAR) LIKE :q OR DATE_FORMAT(visited_at, "%Y-%m-%d %H:%i:%s") LIKE :q)';
        $params[':q'] = '%' . $search . '%';
    }

    $whereSql = count($where) > 0 ? ('WHERE ' . implode(' AND ', $where)) : '';
    $sql = "SELECT id, ip_address, visit_date, visited_at FROM visitor_logs {$whereSql} ORDER BY id DESC LIMIT :row_limit";

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $val) {
        $stmt->bindValue($key, $val, PDO::PARAM_STR);
    }
    $stmt->bindValue(':row_limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    sendJson([
        'ok'         => true,
        'configured' => true,
        'mode'       => 'mysql',
        'stats'      => fetchVisitorStats($pdo),
        'logs'       => $stmt->fetchAll()
    ]);
}

if ($action === 'clear' && $method === 'POST') {
    verifyAdminAuthorization($config);
    $pdo->exec('TRUNCATE TABLE visitor_logs');
    sendJson([
        'ok'         => true,
        'configured' => true,
        'mode'       => 'mysql',
        'stats'      => fetchVisitorStats($pdo)
    ]);
}

sendJson([
    'ok'      => false,
    'message' => 'Unsupported action or HTTP method.'
], 400);
