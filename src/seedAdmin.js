// seedAdmin.js
const User = require('./models/User');
const Department = require('./models/Department');

async function createSuperAdmin() {
  try {
    console.log('🔍 Checking for Administration department...');
    let adminDept = await Department.findOne({ name: 'Administration' });

    if (!adminDept) {
      adminDept = await Department.create({
        name: 'Administration',
        code: 'ADM',
        description: 'System Administration Department',
      });
      console.log('📁 Administration department created');
    }

    const existingAdmin = await User.findOne({ role: 'superadmin' });

    if (existingAdmin) {
      console.log('ℹ️ Superadmin exists → skipping...');
      return;
    }

    console.log('👤 Creating SuperAdmin...');

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

    console.log('🎉 SuperAdmin created!');
  } catch (err) {
    console.error('❌ Error creating SuperAdmin:', err.message);
  }
}

module.exports = createSuperAdmin;
