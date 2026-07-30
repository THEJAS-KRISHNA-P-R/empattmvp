const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSchema() {
  const connectionString = 'postgres://postgres:Supabaseexploit@db.mxaohqeoectalnccawxc.supabase.co:5432/postgres';
  
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL database.');
    
    const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Executing schema.sql...');
    await client.query(schemaSql);
    console.log('Schema executed successfully.');
    
  } catch (error) {
    console.error('Error executing schema:', error);
  } finally {
    await client.end();
  }
}

runSchema();
