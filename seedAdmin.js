// seedAdmin.js
const User = require('./src/models/User');
const Department = require('./src/models/Department');

async function createSuperAdmin() {
  try {
    console.log('🚀 Starting SuperAdmin seed...');

    let adminDept = await Department.findOne({ name: 'Administration' });

    if (!adminDept) {
      console.log('📁 Administration department not found. Creating...');

      adminDept = await Department.create({
        name: 'Administration',
        code: 'ADM',
        description: 'System Administration Department',
      });

      console.log('✅ Administration department created.');
    } else {
      console.log('✅ Administration department already exists.');
    }

    const existingAdmin = await User.findOne({ role: 'superadmin' });

    if (existingAdmin) {
      console.log('⚠️ SuperAdmin already exists.');
      console.log(`📧 Email: ${existingAdmin.email}`);
      return;
    }

    console.log('👤 Creating SuperAdmin...');

    const admin = await User.create({
      employeeId: 'ADM001',
      email: 'admin@staffsync.com',
      password: 'StaffSync@123',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'superadmin',
      department: adminDept._id,
      designation: 'System Administrator',
      dateOfJoining: new Date(),
      isActive: true,
    });

    console.log('🎉 SuperAdmin created successfully!');
    console.log('-----------------------------------');
    console.log(`🆔 Employee ID : ${admin.employeeId}`);
    console.log(`📧 Email       : ${admin.email}`);
    console.log(`🔑 Password    : StaffSync@123`);
    console.log(`👑 Role        : ${admin.role}`);
    console.log('-----------------------------------');
  } catch (err) {
    console.error('❌ Error creating SuperAdmin:', err);
  }
}

module.exports = createSuperAdmin;