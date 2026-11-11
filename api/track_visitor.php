<?php
/**
 * BTEB Portal - Reusable Visitor Tracking Helper (api/track_visitor.php)
 *
 * Safely logs one entry per IP address per date into `visitor_logs`
 * (preventing duplicate rows for the same IP on the same day).
 * Supports both PDO ($pdo) and MySQLi ($conn) using prepared statements.
 */

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
 *
 * @param PDO|mysqli $db
 * @return array{recorded:bool, duplicate:bool, id:int|null}
 */
function btebTrackVisitorVisit($db, string $visitDate, bool $trustProxy = false): array {
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
