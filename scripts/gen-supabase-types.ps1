cd C:\Projects\OKSANA_INTERFACE
New-Item -ItemType Directory -Force -Path "src\types" | Out-Null
supabase gen types typescript --local | Out-File -Encoding utf8 "src\types\supabase.ts"
