require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User'); 
const Department = require('./models/Department'); 

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  return createSuperAdmin();
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

async function createSuperAdmin() {
  try {
    // Ensure "Administration" department exists
    console.log('🔍 Checking for Administration department...');
    let adminDept = await Department.findOne({ name: 'Administration' });
    
    if (!adminDept) {
      console.log('📁 Creating Administration department...');
      adminDept = await Department.create({ 
        name: 'Administration', 
        code: 'ADM',
        description: 'System Administration Department'
      });
      console.log('✅ Department created:', adminDept.name);
    } else {
      console.log('✅ Administration department found');
    }

    // Check if superadmin exists
    console.log('🔍 Checking if superadmin exists...');
    const existingAdmin = await User.findOne({ role: 'superadmin' });
    
    if (existingAdmin) {
      console.log('❌ Superadmin already exists:');
      console.log('   📧 Email:', existingAdmin.email);
      console.log('   🆔 Employee ID:', existingAdmin.employeeId);
      console.log('   👤 Name:', existingAdmin.fullName);
      console.log('ℹ️  No changes made. You can login with existing credentials.');
      mongoose.connection.close();
      process.exit(0);
    }

    console.log('👤 Creating superadmin user...');

    // Create superadmin with MINIMAL required fields only
    const adminUser = new User({
      employeeId: 'ADM001',
      email: 'admin@example.com',
      password: 'Admin@123', // Will be automatically hashed
      firstName: 'System',
      lastName: 'Administrator',
      role: 'superadmin',
      department: adminDept._id,
      designation: 'System Administrator',
      dateOfJoining: new Date(),
      isActive: true,
      // No other fields required! Schema handles the rest for admin roles
    });

    await adminUser.save();
    
    console.log('\n🎉 SUPERADMIN CREATED SUCCESSFULLY! 🎉');
    console.log('═══════════════════════════════════════');
    console.log('📧 Login Email:     ', adminUser.email);
    console.log('🔐 Password:        ', 'Admin@123');
    console.log('🆔 Employee ID:     ', adminUser.employeeId);
    console.log('👤 Full Name:       ', adminUser.fullName);
    console.log('🏢 Department:      ', adminDept.name);
    console.log('📅 Join Date:       ', adminUser.dateOfJoining.toLocaleDateString());
    console.log('✅ Status:          Active');
    console.log('═══════════════════════════════════════');
    console.log('💡 Change password after first login for security');
    
    await mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    console.error('\n❌ ERROR CREATING SUPERADMIN:');
    console.error('═══════════════════════════════════════');
    
    if (err.name === 'ValidationError') {
      console.error('Validation Errors:');
      Object.keys(err.errors).forEach(key => {
        console.error(`  ❌ ${key}: ${err.errors[key].message}`);
      });
    } else if (err.code === 11000) {
      console.error('❌ Duplicate key error - User or Department may already exist');
    } else {
      console.error('Error details:', err.message);
    }
    
    console.error('═══════════════════════════════════════');
    await mongoose.connection.close();
    process.exit(1);
  }
}