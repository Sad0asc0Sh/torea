'use strict';

require('dotenv').config();
const pool = require('../src/config/db');

async function checkSchema() {
  console.log('Checking database schema for automation_item_logs table...\n');
  
  try {
    // Check if automation_item_logs table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'automation_item_logs'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ automation_item_logs table does not exist');
      console.log('   Please run migration: migrations/016_automation_module_improvements.sql');
      process.exit(1);
    }
    
    console.log('✅ automation_item_logs table exists');
    
    // Check columns
    const columnsCheck = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'automation_item_logs'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nTable columns:');
    columnsCheck.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });
    
    // Check if reminded_48h action_type is allowed
    const constraintCheck = await pool.query(`
      SELECT con.conname, pg_get_constraintdef(con.oid)
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'automation_item_logs'
      AND con.contype = 'c'
      AND con.conname LIKE '%action_type%';
    `);
    
    if (constraintCheck.rows.length > 0) {
      console.log('\nAction type constraint:');
      console.log('  ' + constraintCheck.rows[0].pg_get_constraintdef);
    }
    
    console.log('\n✅ Database schema is ready for reminder system');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error checking schema:', err.message);
    await pool.end();
    process.exit(1);
  }
}

checkSchema();
