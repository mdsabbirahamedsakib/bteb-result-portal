<?php
/**
 * BTEB Portal - Reusable Visitor Tracking Helper (api/track_visitor.php)
 *
 * Safely logs one entry per IP address per date into `visitor_logs`
 * (preventing duplicate rows for the same IP on the same day).
 * Supports both PDO ($pdo) and MySQLi ($conn) using prepared statements.
 */

function btebIsBotUserAgent(?string $ua = null): bool {
    $agent = $ua !== null ? $ua : (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $trimmed = trim($agent);
    if ($trimmed === '') {
        return true;
    }
    return preg_match(
        '/bot|crawl|spider|slurp|mediapartners|adsbot|bingpreview|duckduckbot|yandex|baiduspider|sogou|exabot|facebot|facebookexternalhit|ia_archiver|twitterbot|whatsapp|telegrambot|discordbot|linkedinbot|pinterest|applebot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|anthropic|perplexitybot|ccbot|headlesschrome|phantomjs|slimerjs|playwright|puppeteer|selenium|webdriver|cypress|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|java\/|okhttp|axios|node-fetch|undici|postmanruntime|insomnia/i',
        $trimmed
    ) === 1;
}

function btebResolveClientIp(bool $trustProxy = false): string {
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

/**
 * Check if IP has visited on $visitDate; if not, insert into `visitor_logs`.
 * Blocks automated bots/crawlers/headless clients cleanly before writing.
 *
 * @param PDO|mysqli $db
 * @return array{recorded:bool, duplicate:bool, botBlocked?:bool, id:int|null}
 */
function btebTrackVisitorVisit($db, string $visitDate, bool $trustProxy = false): array {
    if (btebIsBotUserAgent()) {
        return [
            'recorded'   => false,
            'duplicate'  => false,
            'botBlocked' => true,
            'id'         => null
        ];
    }

    $userIp = btebResolveClientIp($trustProxy);

    if ($db instanceof PDO) {
        $checkStmt = $db->prepare('SELECT id FROM visitor_logs WHERE ip_address = :ip AND visit_date = :visit_date LIMIT 1');
        $checkStmt->execute([
            ':ip'         => $userIp,
            ':visit_date' => $visitDate
        ]);
        $existingId = $checkStmt->fetchColumn();
        if ($existingId !== false) {
            return [
                'recorded'  => false,
                'duplicate' => true,
                'id'        => (int)$existingId
            ];
        }

        $insertStmt = $db->prepare('INSERT IGNORE INTO visitor_logs (ip_address, visit_date) VALUES (:ip, :visit_date)');
        $insertStmt->execute([
            ':ip'         => $userIp,
            ':visit_date' => $visitDate
        ]);
        $inserted = $insertStmt->rowCount() > 0;
        return [
            'recorded'  => $inserted,
            'duplicate' => !$inserted,
            'id'        => $inserted ? (int)$db->lastInsertId() : null
        ];
    }

    if ($db instanceof mysqli) {
        $checkStmt = mysqli_prepare($db, 'SELECT id FROM visitor_logs WHERE ip_address = ? AND visit_date = ? LIMIT 1');
        if ($checkStmt) {
            mysqli_stmt_bind_param($checkStmt, 'ss', $userIp, $visitDate);
            mysqli_stmt_execute($checkStmt);
            mysqli_stmt_store_result($checkStmt);
            if (mysqli_stmt_num_rows($checkStmt) > 0) {
                mysqli_stmt_bind_result($checkStmt, $existingId);
                mysqli_stmt_fetch($checkStmt);
                mysqli_stmt_close($checkStmt);
                return [
                    'recorded'  => false,
                    'duplicate' => true,
                    'id'        => (int)$existingId
                ];
            }
            mysqli_stmt_close($checkStmt);
        }

        $insertStmt = mysqli_prepare($db, 'INSERT IGNORE INTO visitor_logs (ip_address, visit_date) VALUES (?, ?)');
        if ($insertStmt) {
            mysqli_stmt_bind_param($insertStmt, 'ss', $userIp, $visitDate);
            mysqli_stmt_execute($insertStmt);
            $affected = mysqli_stmt_affected_rows($insertStmt);
            $newId = mysqli_insert_id($db);
            mysqli_stmt_close($insertStmt);
            return [
                'recorded'  => $affected > 0,
                'duplicate' => $affected <= 0,
                'id'        => $affected > 0 ? (int)$newId : null
            ];
        }
    }

    return ['recorded' => false, 'duplicate' => false, 'id' => null];
}

/**
 * Fetch per-day visitor summary for the last $limit days.
 * Exact equivalent of:
 *   SELECT visit_date, COUNT(id) AS total_visitors
 *   FROM visitor_logs GROUP BY visit_date ORDER BY visit_date DESC LIMIT ?
 *
 * @param PDO|mysqli $db
 * @return array<int, array{visit_date:string, total_visitors:int}>
 */
function btebGetDailyVisitorSummary($db, int $limit = 30): array {
    $safeLimit = max(1, min(365, $limit));

    if ($db instanceof PDO) {
        $stmt = $db->prepare('SELECT visit_date, COUNT(id) AS total_visitors FROM visitor_logs GROUP BY visit_date ORDER BY visit_date DESC LIMIT :lim');
        $stmt->bindValue(':lim', $safeLimit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return array_map(function ($row) {
            return [
                'visit_date'     => (string)$row['visit_date'],
                'total_visitors' => (int)$row['total_visitors']
            ];
        }, $rows ?: []);
    }

    if ($db instanceof mysqli) {
        $stmt = mysqli_prepare($db, 'SELECT visit_date, COUNT(id) AS total_visitors FROM visitor_logs GROUP BY visit_date ORDER BY visit_date DESC LIMIT ?');
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'i', $safeLimit);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $out = [];
            if ($res) {
                while ($row = mysqli_fetch_assoc($res)) {
                    $out[] = [
                        'visit_date'     => (string)$row['visit_date'],
                        'total_visitors' => (int)$row['total_visitors']
                    ];
                }
            }
            mysqli_stmt_close($stmt);
            return $out;
        }
    }

    return [];
}

// Auto-run cleanly when included directly into a PHP page that provides $conn or $pdo
if (!defined('BTEB_VISITOR_LIB_ONLY')) {
    if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
        session_start();
    }
    $todayDate = date('Y-m-d');
    if (isset($conn) && $conn instanceof mysqli) {
        btebTrackVisitorVisit($conn, $todayDate, false);
    } elseif (isset($pdo) && $pdo instanceof PDO) {
        btebTrackVisitorVisit($pdo, $todayDate, false);
    }
}
