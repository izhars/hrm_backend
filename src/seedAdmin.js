// seedAdmin.js
const User = require('./models/User');
const Department = require('./models/Department');

async function createSuperAdmin() {
  try {
    let adminDept = await Department.findOne({ name: 'Administration' });

    if (!adminDept) {
      adminDept = await Department.create({
        name: 'Administration',
        code: 'ADM',
        description: 'System Administration Department',
      });
    }

    const existingAdmin = await User.findOne({ role: 'superadmin' });

    if (existingAdmin) {
      return;
    }

    await User.create({
      employeeId: 'ADM001',
      email: 'admin@example.com',
      password: 'Admin@123',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'superadmin',
      department: adminDept._id,
      designation: 'System Administrator',
      dateOfJoining: new Date(),
      isActive: true,
    });

  } catch (err) {
    console.error('❌ Error creating SuperAdmin:', err.message);
  }
}

module.exports = createSuperAdmin;
