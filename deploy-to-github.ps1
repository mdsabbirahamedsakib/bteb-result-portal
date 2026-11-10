# ==============================================================================
# BTEB Result & Education Portal - Automatic GitHub Repository Creator & Pusher
# Repository Name: bteb-result-portal
# ==============================================================================

param(
    [string]$GitHubToken = "",
    [string]$RepoName = "bteb-result-portal",
    [string]$RepoDescription = "Ultra-Fast BTEB Result & Education Portal for Polytechnic Students in Bangladesh (Client-Side PDF Engine & O(1) Search)",
    [switch]$Private = $false
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  BTEB Result Portal - GitHub Automatic Deployment Tool   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Ask for GitHub Personal Access Token if not provided
if (-not $GitHubToken) {
    Write-Host "[1/4] আপনার GitHub Personal Access Token (PAT) প্রয়োজন।" -ForegroundColor Yellow
    Write-Host "      (যদি টোকেন না থাকে: GitHub -> Settings -> Developer Settings -> Personal access tokens -> Generate new token (classic) -> 'repo' সিলেক্ট করুন)" -ForegroundColor Gray
    Write-Host ""
    $GitHubToken = Read-Host "আপনার GitHub Personal Access Token পেস্ট করুন"
}

if (-not $GitHubToken) {
    Write-Host "❌ কোনো টোকেন দেওয়া হয়নি! প্রসেস বাতিল করা হয়েছে।" -ForegroundColor Red
    exit 1
}

$GitHubToken = $GitHubToken.Trim()
$headers = @{
    "Authorization" = "Bearer $GitHubToken"
    "Accept"        = "application/vnd.github.v3+json"
    "User-Agent"    = "BTEB-Portal-Deployer"
}

# 2. Verify GitHub User
Write-Host ""
Write-Host "[2/4] GitHub অ্যাকাউন্ট যাচাই করা হচ্ছে..." -ForegroundColor Cyan
try {
    $userResponse = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method Get
    $username = $userResponse.login
    Write-Host "  ✅ লগইন সফল: @$username ($($userResponse.name))" -ForegroundColor Green
} catch {
    Write-Host "  ❌ টোকেন অবৈধ বা কানেকশন ত্রুটি: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Create or check repository
Write-Host ""
Write-Host "[3/4] '$RepoName' রিপোজিটরি তৈরি করা হচ্ছে..." -ForegroundColor Cyan
$repoExists = $false
try {
    $existingRepo = Invoke-RestMethod -Uri "https://api.github.com/repos/$username/$RepoName" -Headers $headers -Method Get
    Write-Host "  ℹ️ রিপোজিটরি '$RepoName' ইতোমধ্যে আপনার অ্যাকাউন্টে রয়েছে।" -ForegroundColor Yellow
    $repoExists = $true
    $repoUrl = $existingRepo.html_url
    $cloneUrl = $existingRepo.clone_url
} catch {
    # Repo doesn't exist, create it
    $createBody = @{
        name        = $RepoName
        description = $RepoDescription
        private     = [bool]$Private
        has_issues  = $true
        has_wiki    = $false
        auto_init   = $false
    } | ConvertTo-Json

    try {
        $newRepo = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post -Body $createBody -ContentType "application/json"
        Write-Host "  ✅ নতুন রিপোজিটরি তৈরি সফল: $($newRepo.html_url)" -ForegroundColor Green
        $repoUrl = $newRepo.html_url
        $cloneUrl = $newRepo.clone_url
    } catch {
        Write-Host "  ❌ রিপোজিটরি তৈরি করতে ব্যর্থ: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# 4. Upload Files
Write-Host ""
Write-Host "[4/4] প্রজেক্ট ফাইলগুলো GitHub-এ আপলোড করা হচ্ছে..." -ForegroundColor Cyan

$projectDir = $PSScriptRoot
if (-not $projectDir) { $projectDir = Get-Location }

# Check if git is installed locally
$hasGit = $null -ne (Get-Command git -ErrorAction SilentlyContinue)

if ($hasGit) {
    Write-Host "  ⚡ Git পাওয়া গেছে! Git Push দিয়ে ফাইল আপলোড হচ্ছে..." -ForegroundColor Cyan
    Push-Location $projectDir
    try {
        if (-not (Test-Path ".git")) {
            git init
            git branch -M main
        }
        git config user.name "$username"
        git config user.email "$username@users.noreply.github.com"
        git add -A
        git commit -m "Initial commit: BTEB Result & Education Portal Complete Modular Code" --allow-empty
        
        $authCloneUrl = "https://$($username):$($GitHubToken)@github.com/$username/$RepoName.git"
        git remote remove origin 2>$null
        git remote add origin $authCloneUrl
        git push -u origin main --force
        Write-Host "  ✅ Git Push সফলভাবে সম্পন্ন হয়েছে!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  ℹ️ সিস্টেমে Git ইনস্টল নেই, তাই GitHub REST API দিয়ে সরাসরি ফাইলগুলো আপলোড করা হচ্ছে..." -ForegroundColor Cyan
    
    $filesToUpload = Get-ChildItem -Path $projectDir -Recurse -File | Where-Object { 
        $_.FullName -notmatch '\\\.git\\' -and 
        $_.Name -ne 'deploy-to-github.ps1' -and 
        $_.Name -notmatch '\.zip$' 
    }

    $uploadedCount = 0
    foreach ($file in $filesToUpload) {
        $relativePath = $file.FullName.Substring($projectDir.Length).TrimStart('\', '/').Replace('\', '/')
        $fileBytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $base64Content = [Convert]::ToBase64String($fileBytes)

        # Check if file already exists to get SHA
        $sha = $null
        try {
            $existingFile = Invoke-RestMethod -Uri "https://api.github.com/repos/$username/$RepoName/contents/$relativePath" -Headers $headers -Method Get
            $sha = $existingFile.sha
        } catch {}

        $putBody = @{
            message = "Add $relativePath"
            content = $base64Content
        }
        if ($sha) { $putBody["sha"] = $sha }

        $jsonBody = $putBody | ConvertTo-Json

        try {
            $uploadRes = Invoke-RestMethod -Uri "https://api.github.com/repos/$username/$RepoName/contents/$relativePath" -Headers $headers -Method Put -Body $jsonBody -ContentType "application/json"
            $uploadedCount++
            Write-Host "    ✓ আপলোড হয়েছে: $relativePath" -ForegroundColor Gray
        } catch {
            Write-Host "    ⚠️ আপলোড ব্যর্থ ($relativePath): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    Write-Host "  ✅ মোট $uploadedCount টি ফাইল সরাসরি GitHub-এ সংরক্ষিত হয়েছে!" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "🎉 অভিনন্দন! আপনার প্রজেক্টটি সফলভাবে GitHub-এ যুক্ত হয়েছে।" -ForegroundColor Green
Write-Host "🔗 রিপোজিটরি লিংক: $repoUrl" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 GitHub Pages সক্রিয় করার নিয়ম (বিনামূল্যে ওয়েবসাইট লাইভ করতে):" -ForegroundColor Yellow
Write-Host "   ১. $repoUrl/settings/pages এ যান।" -ForegroundColor White
Write-Host "   ২. 'Build and deployment' -> 'Branch' এ 'main' সিলেক্ট করে 'Save' চাপুন।" -ForegroundColor White
Write-Host "   ৩. ১ মিনিটের মধ্যে https://$username.github.io/$RepoName এ সাইটটি বিশ্বব্যাপী লাইভ হয়ে যাবে!" -ForegroundColor White
Write-Host ""
