# Quick Permissions Guide 🔒

## 🎯 What's New?

You can now create users with access to **specific modules only**!

For example:
- User with **only Darbuotojai** access
- User with **only Technika** access
- User with **view-only** access to multiple modules
- User with **custom combination** of permissions

## 🚀 Quick Start

### Create User with Custom Permissions

1. **Add New User**
   - Go to "Vartotojų Valdymas"
   - Click "Pridėti Vartotoją"
   - Fill in email, password, name
   - Select role: **"Pasirinktinė prieiga"**
   - Click "Pridėti Vartotoją"

2. **Set Permissions**
   - Find the new user in the list
   - Click the **🔒 lock icon**
   - In the modal, check permissions for each module:
     - ☑️ **Žiūrėti** (View) - Can see data
     - ☑️ **Kurti** (Create) - Can add new records
     - ☑️ **Redaguoti** (Edit) - Can modify existing records
     - ☑️ **Trinti** (Delete) - Can delete records
   - Click "Išsaugoti Prieigos Teises"

3. **Done!** 🎉
   - User now has access only to selected modules
   - User will only see granted modules in the menu

## 📋 Common Scenarios

### Scenario 1: Secretary (Darbuotojai Only)
```
Role: Pasirinktinė prieiga
Permissions:
  Darbuotojai: ✓ View ✓ Create ✓ Edit
  All others: ✗ No access
```

### Scenario 2: Equipment Manager (Technika Only)
```
Role: Pasirinktinė prieiga
Permissions:
  Technika: ✓ View ✓ Create ✓ Edit ✓ Delete
  All others: ✗ No access
```

### Scenario 3: Report Viewer (Read-Only)
```
Role: Pasirinktinė prieiga
Permissions:
  Darbuotojai: ✓ View only
  Technika: ✓ View only
  Ataskaitos: ✓ View only
  All others: ✗ No access
```

### Scenario 4: Multi-Module Coordinator
```
Role: Pasirinktinė prieiga
Permissions:
  Darbuotojai: ✓ View ✓ Create ✓ Edit
  Technika: ✓ View ✓ Create ✓ Edit
  Ataskaitos: ✓ View only
  All others: ✗ No access
```

## 🎨 Visual Guide

### Role Selection
When adding a user, you'll see:
```
┌─────────────────────────────────────┐
│ Rolė                                │
├─────────────────────────────────────┤
│ Veterinarijos modulis               │
│   ○ Stebėtojas (View Only)         │
│   ○ Technikas (Limited Access)     │
│   ○ Veterinaras (Full Access)      │
│   ○ Administratorius (All Access)  │
├─────────────────────────────────────┤
│ Technikos modulis                   │
│   ○ Fermos darbuotojas             │
│   ○ Technikos kiemo darbuotojas    │
├─────────────────────────────────────┤
│ Pasirinktinė prieiga               │
│   ● Pasirinktinė prieiga (Custom)  │ ← NEW!
└─────────────────────────────────────┘
```

### User List
Users with custom role show purple badge:
```
┌──────────────────────────────────────────────┐
│ Name: Jonas Jonaitis                        │
│ Email: jonas@example.com                    │
│ Role: 🔧 Pasirinktinė prieiga               │ ← Purple badge
│ Actions: [✏️ Edit] [🔒 Lock] [📊] [❄️] [🗑️] │
│                      ↑                       │
│                  Click here to manage        │
│                  permissions!                │
└──────────────────────────────────────────────┘
```

### Permissions Modal
```
┌────────────────────────────────────────────────┐
│ 🔒 Modulių Prieigos Valdymas           [✖️]   │
├────────────────────────────────────────────────┤
│                                                │
│ ┌────────────────────────────────────────┐   │
│ │ Darbuotojai                            │   │
│ │ ☑️ 👁️ Žiūrėti                          │   │
│ │ ☑️ ➕ Kurti                             │   │
│ │ ☑️ ✏️ Redaguoti                        │   │
│ │ ☐ 🗑️ Trinti                            │   │
│ └────────────────────────────────────────┘   │
│                                                │
│ ┌────────────────────────────────────────┐   │
│ │ Technika                               │   │
│ │ ☑️ 👁️ Žiūrėti                          │   │
│ │ ☐ ➕ Kurti                              │   │
│ │ ☐ ✏️ Redaguoti                         │   │
│ │ ☐ 🗑️ Trinti                            │   │
│ └────────────────────────────────────────┘   │
│                                                │
│ [More modules...]                              │
│                                                │
├────────────────────────────────────────────────┤
│                   [Atšaukti] [✓ Išsaugoti]    │
└────────────────────────────────────────────────┘
```

## 📚 Available Modules

| Module | Description |
|--------|-------------|
| **Darbuotojai** | Employee management & schedules |
| **Technika** | Equipment & machinery |
| **Veterinarija** | Veterinary system |
| **Sandėlis** | Warehouse management |
| **Atsargos** | Stock & inventory |
| **Biocidai** | Biocides management |
| **Atliekos** | Waste management |
| **Gyvūnai** | Animal records |
| **Gydymai** | Treatment records |
| **Ataskaitos** | Reports & analytics |
| **Nustatymai** | System settings |

## 🔑 Permission Types

| Icon | Permission | Description |
|------|-----------|-------------|
| 👁️ | **Žiūrėti** | Can view/read data |
| ➕ | **Kurti** | Can create new records |
| ✏️ | **Redaguoti** | Can edit existing records |
| 🗑️ | **Trinti** | Can delete records |

## ⚡ Quick Tips

1. **Start with View Permission**
   - Always grant "Žiūrėti" first
   - Then add other permissions as needed

2. **Be Specific**
   - Only grant permissions user actually needs
   - Less is more secure

3. **Test First**
   - Create test user
   - Set permissions
   - Log in as test user to verify

4. **Edit Anytime**
   - Permissions can be changed anytime
   - Click 🔒 lock icon to modify

5. **Admin Override**
   - Admin role always has full access
   - Cannot be restricted

## ❓ FAQ

**Q: Can I give a user access to just one module?**
A: Yes! Select "Pasirinktinė prieiga" role and grant permissions only for that module.

**Q: What if I want view-only access?**
A: Check only "Žiūrėti" permission, leave others unchecked.

**Q: Can I change permissions later?**
A: Yes! Click the 🔒 lock icon next to the user anytime.

**Q: What's the difference between roles?**
- **Admin**: Full access to everything
- **Vet**: Veterinary modules
- **Tech**: Warehouse/technical modules
- **Viewer**: Read-only all modules
- **Custom**: You choose exactly what they can access!

**Q: Do I need to set permissions for every module?**
A: No! Only set permissions for modules you want the user to access.

## 🚨 Important Notes

- ⚠️ Users with "Pasirinktinė prieiga" role but **no permissions set** will have **no access** to any module
- ⚠️ Always set at least "Žiūrėti" permission for modules user needs
- ⚠️ Changes take effect immediately after saving
- ⚠️ User must log out and log in again to see changes

## 🎯 Best Practices

1. **Principle of Least Privilege**
   - Give minimum permissions needed
   - Add more only when necessary

2. **Regular Review**
   - Periodically review user permissions
   - Remove access no longer needed

3. **Document Decisions**
   - Note why specific permissions were granted
   - Helps with future audits

4. **Test Changes**
   - Test new permission sets with test users
   - Verify everything works as expected

## 📞 Need Help?

1. Check full documentation: `GRANULAR_PERMISSIONS_SYSTEM.md`
2. Test with a dummy user first
3. Contact system administrator
4. Review audit logs for permission changes

---

**Ready to create custom users? Let's go! 🚀**
