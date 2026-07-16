// src/seed/seedHr.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load environment variables from root
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Import models from src folder
const User = require('../models/User');
const Department = require('../models/Department');

// HR Data
const hrData = {
  employeeId: 'HR001',
  firstName: 'HR',
  lastName: 'Admin',
  email: 'hr@staffsync.com',
  password: 'Hr@123456',
  role: 'hr',
  department: 'Human Resources',
  designation: 'HR Manager',
  phone: '9876543210',
  gender: 'female',
  dateOfBirth: new Date('1990-01-15'),
  dateOfJoining: new Date('2020-01-01'),
  maritalStatus: 'married',
  bloodGroup: 'O+',
  address: {
    street: '123 HR Tower',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    postalCode: '400001'
  },
  isActive: true,
  isVerified: true,
  employmentType: 'full-time',
  leaveBalance: {
    casual: 12,
    sick: 10,
    earned: 15,
    combo: 0,
    unpaid: 0
  }
};

// Function to seed HR
async function seedHR() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    console.log(`🔌 Connecting to MongoDB: ${mongoURI.replace(/\/\/.*@/, '//***@')}`);
    
    // Connect to MongoDB
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB\n');

    // Check if HR already exists
    const existingHR = await User.findOne({ 
      $or: [{ email: hrData.email }, { employeeId: hrData.employeeId }] 
    });

    if (existingHR) {
      console.log('⚠️ HR user already exists:');
      console.log(`   📋 ID: ${existingHR.employeeId}`);
      console.log(`   👤 Name: ${existingHR.firstName} ${existingHR.lastName}`);
      console.log(`   📧 Email: ${existingHR.email}`);
      console.log(`   🏢 Department: ${existingHR.department?.name || 'N/A'}`);
      console.log('\n💡 To re-seed, delete this user first using resetSeeds.js');
      process.exit(0);
    }

    // Get or create HR Department
    let department = await Department.findOne({ 
      name: { $regex: new RegExp(`^${hrData.department.trim()}$`, 'i') } 
    });

    if (!department) {
      const code = hrData.department
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 4);

      department = await Department.create({
        name: hrData.department.trim(),
        code: code,
        isActive: true
      });
      console.log(`✅ Department created: ${department.name} (${department.code})`);
    } else {
      console.log(`✅ Department found: ${department.name} (${department.code})`);
    }

    // Set department ID
    hrData.department = department._id;

    // Hash password
    const salt = await bcrypt.genSalt(12);
    hrData.password = await bcrypt.hash(hrData.password, salt);

    // Create HR user
    const hrUser = new User(hrData);
    await hrUser.save();

    // Update department head
    if (!department.head) {
      department.head = hrUser._id;
      await department.save();
    }

    console.log('\n✅ HR user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 Employee ID: ${hrUser.employeeId}`);
    console.log(`👤 Name: ${hrUser.firstName} ${hrUser.lastName}`);
    console.log(`📧 Email: ${hrUser.email}`);
    console.log(`🔑 Password: Hr@123456`);
    console.log(`🏢 Department: ${hrData.department}`);
    console.log(`💼 Role: ${hrUser.role}`);
    console.log(`🆔 User ID: ${hrUser._id}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 HR seeding completed successfully!');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding HR:', error.message);
    if (error.code === 11000) {
      console.error('⚠️ Duplicate key error - user may already exist');
      console.error('   Try running: node src/seed/resetSeeds.js');
    }
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the seed
seedHR();