# Cost Center Service/Repair Tracking

## Overview
Track whether a cost center represents a service or repair, and who performed the work - your workers or an external company.

## Features

### 1. Service Checkbox
When creating/editing a cost center, you can mark it as a service/repair:
- ☑️ **"Ar tai paslauga / remontas?"** checkbox

### 2. Worker Selection
If it's a service performed by **your workers**:
- Select "Mūsų darbuotojai"
- Choose one or multiple workers from the list
- Workers are loaded from the system (farm_worker, warehouse_worker roles)

### 3. External Company
If it's a service performed by an **external company**:
- Select "Įmonė"
- Enter the company name (e.g., "UAB Remonto meistrai")

## Database Schema

```sql
cost_centers:
  - is_service (boolean) - Is this a service/repair?
  - service_type (text) - 'our_workers' or 'external_company'
  - service_worker_ids (uuid[]) - Array of worker IDs
  - service_company_name (text) - External company name
```

## Use Cases

### Example 1: Tractor Repair by Your Workers
- Name: "Traktoriaus remontas"
- ☑️ Ar tai paslauga / remontas?
- Service type: Mūsų darbuotojai
- Workers: ☑️ Jonas Jonaitis, ☑️ Petras Petraitis

### Example 2: Building Repair by External Company
- Name: "Sandėlio stogo remontas"
- ☑️ Ar tai paslauga / remontas?
- Service type: Įmonė
- Company: "UAB Stogų meistrai"

### Example 3: Regular Cost Center (Not a Service)
- Name: "Pašarai"
- ☐ Ar tai paslauga / remontas? (unchecked)
- No service fields shown

## Benefits

1. **Track Labor**: Know exactly who performed each service
2. **External vs Internal**: Distinguish between your workers and contractors
3. **Cost Analysis**: Analyze service costs by worker or company
4. **Historical Record**: Maintain records of who did what work
5. **Future Reporting**: Can generate reports on:
   - Services by worker
   - Services by company
   - Internal vs external service costs

## Validation

The system validates:
- If service is checked, must select service type
- If "our workers", must select at least one worker
- If "external company", must enter company name

## Future Enhancements

Possible additions:
- Service date tracking
- Service completion status
- Worker hours per service
- Cost comparison (internal vs external)
- Service quality ratings
