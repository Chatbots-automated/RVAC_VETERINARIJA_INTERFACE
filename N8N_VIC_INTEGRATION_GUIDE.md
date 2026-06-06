# n8n Integration Guide for VIC Credentials

## Overview

This guide explains how to access VIC credentials from n8n workflows for automated data synchronization with VIC (Veterinary Information Center).

## Architecture

### Storage Location
- **Table**: `vic_credentials`
- **Access**: Organization-wide (all farms, all users)
- **Management**: Admin users via the UI "VIC duomenys" button

## Method 1: Using Supabase Node (Recommended)

### Step 1: Add Supabase Credentials to n8n

1. Go to n8n → Credentials
2. Add new credential → Supabase
3. Enter your Supabase details:
   - **Host**: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
   - **Service Role Key**: Your service_role key (from Supabase dashboard)

### Step 2: Create Supabase Node in Workflow

Add a Supabase node with these settings:

- **Operation**: Select rows
- **Table**: `vic_credentials`
- **Return All**: No
- **Limit**: 1
- **Filters**:
  ```json
  {
    "is_active": {
      "eq": true
    }
  }
  ```
- **Sort**: 
  - Field: `created_at`
  - Direction: Descending

### Step 3: Use the Credentials in Next Nodes

The output will contain:
```json
{
  "id": "uuid",
  "vic_username": "your_vic_username",
  "vic_password": "your_vic_password",
  "description": "Optional description",
  "is_active": true,
  "created_at": "2026-06-07T...",
  "updated_at": "2026-06-07T..."
}
```

Access in subsequent nodes using:
- `{{ $json.vic_username }}`
- `{{ $json.vic_password }}`

## Method 2: Using PostgreSQL Node

### Add PostgreSQL Credentials

1. Go to n8n → Credentials
2. Add new credential → PostgreSQL
3. Enter your Supabase database connection details:
   - **Host**: Your Supabase database host
   - **Database**: `postgres`
   - **User**: `postgres`
   - **Password**: Your database password
   - **Port**: `5432`
   - **SSL**: Enable

### Add PostgreSQL Node

- **Operation**: Execute Query
- **Query**:
  ```sql
  SELECT vic_username, vic_password 
  FROM vic_credentials 
  WHERE is_active = true 
  ORDER BY created_at DESC 
  LIMIT 1;
  ```

## Method 3: Using HTTP Request Node

### Use Supabase REST API

- **Method**: GET
- **URL**: `https://YOUR_PROJECT.supabase.co/rest/v1/vic_credentials`
- **Authentication**: Generic Credential Type
- **Headers**:
  ```json
  {
    "apikey": "YOUR_ANON_KEY",
    "Authorization": "Bearer YOUR_ANON_KEY"
  }
  ```
- **Query Parameters**:
  ```json
  {
    "is_active": "eq.true",
    "order": "created_at.desc",
    "limit": "1"
  }
  ```

## Complete Example Workflow

### Workflow: Sync Animal Data from VIC

```
┌─────────────────┐
│  Schedule       │  Trigger: Every day at 2 AM
│  Trigger        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Supabase       │  Get VIC credentials
│  Get Credentials│  Table: vic_credentials
└────────┬────────┘  Filter: is_active = true
         │
         ▼
┌─────────────────┐
│  HTTP Request   │  Call VIC API
│  to VIC API     │  Auth: {{ $json.vic_username }}
└────────┬────────┘        {{ $json.vic_password }}
         │
         ▼
┌─────────────────┐
│  Transform      │  Process VIC response
│  Data           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Supabase       │  Insert/Update animals
│  Upsert Animals │  Table: animals
└─────────────────┘
```

## Example n8n Code Node

If you need to process credentials in a Code node:

```javascript
// Get VIC credentials from previous Supabase node
const vicCredentials = $input.all()[0].json;

const username = vicCredentials.vic_username;
const password = vicCredentials.vic_password;

// Use credentials for VIC API authentication
const vicResponse = await fetch('https://vic-api-endpoint.com/data', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  },
  body: JSON.stringify({
    // Your request payload
  })
});

const data = await vicResponse.json();

return [{ json: data }];
```

## Security Best Practices

1. **Use Service Role Key**: For n8n automation, use the `service_role` key (has full access)
2. **Secure n8n**: Ensure your n8n instance is properly secured
3. **Rotate Credentials**: Regularly update VIC passwords
4. **Audit Logs**: Monitor who accesses VIC credentials
5. **Error Handling**: Implement proper error handling in workflows

## Troubleshooting

### Issue: "Permission denied for table vic_credentials"

**Solution**: Make sure you're using the `service_role` key, not the `anon` key.

### Issue: "No credentials found"

**Solution**: 
1. Check if VIC credentials exist: `SELECT * FROM vic_credentials;`
2. Ensure `is_active = true`
3. Verify RLS policies are not blocking access

### Issue: "Multiple credentials returned"

**Solution**: Add `LIMIT 1` to your query or filter by a specific `id`.

## Testing Your Integration

1. **Test the Supabase Query**:
   - Run the query directly in Supabase SQL Editor
   - Verify credentials are returned

2. **Test in n8n**:
   - Create a simple workflow with just the Supabase node
   - Execute and check the output
   - Verify username and password are correct

3. **Test VIC API Call**:
   - Add an HTTP Request node after getting credentials
   - Test authentication with VIC API
   - Check for successful response

## Support

If you encounter issues:
1. Check Supabase logs for database errors
2. Check n8n execution logs
3. Verify VIC credentials are correctly entered in the UI
4. Test VIC API credentials manually first
