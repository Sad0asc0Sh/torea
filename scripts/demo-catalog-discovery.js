#!/usr/bin/env node
'use strict';

/**
 * Catalog Discovery Service Demo
 * 
 * This script demonstrates the catalog discovery service by:
 * 1. Discovering catalog items from all sources (routes, EJS, database)
 * 2. Displaying statistics and sample results
 * 3. Showing performance metrics
 */

const { discoverAllCatalogItems, clearCache } = require('../src/services/catalogDiscovery.service');

async function demo() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Catalog Discovery Service - Demonstration             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Clear cache to ensure fresh discovery
  clearCache();

  const startTime = Date.now();
  
  try {
    console.log('🔍 Discovering catalog items...\n');
    
    const result = await discoverAllCatalogItems();
    const duration = Date.now() - startTime;

    // Display performance
    console.log('⚡ Performance Metrics:');
    console.log(`   Duration: ${duration}ms`);
    console.log(`   ${duration < 500 ? '✅ EXCELLENT' : duration < 1000 ? '✅ GOOD' : '⚠️  ACCEPTABLE'} (Target: <500ms)\n`);

    // Display statistics
    console.log('📊 Discovery Statistics:');
    console.log(`   Total items: ${result.stats.total}`);
    console.log(`   New items: ${result.stats.new}`);
    console.log(`   Active items: ${result.stats.active}`);
    console.log(`   Hidden items: ${result.stats.hidden}\n`);

    // Display source breakdown
    console.log('📁 Source Breakdown:');
    console.log(`   From Routes: ${result.stats.sources.route}`);
    console.log(`   From EJS Views: ${result.stats.sources.ejs}`);
    console.log(`   From Database: ${result.stats.sources.database}\n`);

    // Display type breakdown
    console.log('🏷️  Type Breakdown:');
    console.log(`   Pages: ${result.stats.types.page}`);
    console.log(`   Settings: ${result.stats.types.setting}`);
    console.log(`   Reports: ${result.stats.types.report}`);
    console.log(`   Tools: ${result.stats.types.tool}`);
    console.log(`   Groups: ${result.stats.types.group}`);
    console.log(`   Actions: ${result.stats.types.action}\n`);

    // Display tree structure
    console.log('🌳 Tree Structure:');
    console.log(`   Root items: ${result.tree.length}`);
    console.log(`   Flat items: ${result.flat.length}\n`);

    // Display sample items
    console.log('📋 Sample Items (first 5):');
    result.items.slice(0, 5).forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.display_icon || '📄'} ${item.display_title}`);
      console.log(`      Key: ${item.key}`);
      console.log(`      Type: ${item.type}`);
      console.log(`      Sources: ${item.source_label}`);
      console.log(`      Route: ${item.route_admin || 'N/A'}`);
      console.log('');
    });

    // Display grouped summary
    console.log('🗂️  Grouped Summary:');
    console.log(`   Discovered: ${result.grouped.status.discovered.length}`);
    console.log(`   Hybrid (multi-source): ${result.grouped.source.hybrid.length}\n`);

    console.log('✅ Discovery completed successfully!');
    console.log(`📅 Timestamp: ${result.timestamp}\n`);

    return result;
  } catch (err) {
    console.error('❌ Discovery failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run demo if executed directly
if (require.main === module) {
  demo()
    .then(() => {
      console.log('🎉 Demo completed!');
      process.exit(0);
    })
    .catch(err => {
      console.error('💥 Demo failed:', err);
      process.exit(1);
    });
}

module.exports = { demo };
