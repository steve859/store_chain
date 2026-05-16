import { performance } from 'perf_hooks';
import { pricingService } from '../src/modules/pricing/pricing.service';
import prisma from '../src/db/prisma';

/**
 * Load Testing Suite for Pricing Engine
 * Verifies performance requirements:
 * - Price calculation < 100ms
 * - Rule loading < 50ms
 * - History queries < 100ms
 */

interface LoadTestResult {
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  passThreshold: number;
  passed: boolean;
}

async function measureOperation(
  name: string,
  operation: () => Promise<any>,
  iterations: number,
  threshold: number
): Promise<LoadTestResult> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await operation();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const passed = avgTime <= threshold;

  return {
    operation: name,
    iterations,
    totalTime: Math.round(totalTime * 100) / 100,
    avgTime: Math.round(avgTime * 100) / 100,
    minTime: Math.round(minTime * 100) / 100,
    maxTime: Math.round(maxTime * 100) / 100,
    passThreshold: threshold,
    passed,
  };
}

function printResult(result: LoadTestResult) {
  const status = result.passed ? '✅ PASS' : '❌ FAIL';
  const bar = result.passed ? '▓' : '░';
  console.log(`\n${status} ${result.operation}`);
  console.log(`   Avg: ${result.avgTime}ms (threshold: ${result.passThreshold}ms) ${bar}`.padEnd(60, bar));
  console.log(`   Min: ${result.minTime}ms | Max: ${result.maxTime}ms`);
  console.log(`   Total: ${result.totalTime}ms for ${result.iterations} iterations`);
}

async function runLoadTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║        PRICING ENGINE LOAD TEST SUITE                 ║');
  console.log('║     Performance Verification < 100ms Latency         ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  const results: LoadTestResult[] = [];
  const storeId = 1;

  try {
    // Setup: Create test data
    console.log('\n⏳ Setting up test data...');

    const rule = await prisma.pricing_rules.create({
      data: {
        store_id: storeId,
        product_variant_id: 1,
        rule_name: 'Load Test Rule',
        rule_type: 'demand_based',
        base_price: 10.0,
        min_price: 5.0,
        max_price: 20.0,
        priority: 10,
        is_active: true,
        effective_from: new Date(),
      },
    });

    // Create multiple rules to test with more realistic dataset
    for (let i = 2; i <= 5; i++) {
      await prisma.pricing_rules.create({
        data: {
          store_id: storeId,
          rule_name: `Load Test Rule ${i}`,
          rule_type: i % 2 === 0 ? 'percentage' : 'time_based',
          base_price: 10.0,
          adjustment_value: i * 2,
          priority: i,
          is_active: true,
          effective_from: new Date(),
        },
      });
    }

    await prisma.demand_metrics.create({
      data: {
        store_id: storeId,
        product_variant_id: 1,
        day_of_week: 3,
        demand_level: 75,
        sales_count_24h: 50,
        inventory_level: 100,
      },
    });

    console.log('✅ Test data created\n');

    // Test 1: Get Applicable Rules (should be < 50ms)
    console.log('\n📊 TEST 1: Rule Loading Performance');
    const ruleResult = await measureOperation(
      'getApplicableRules()',
      () => pricingService.getApplicableRules(storeId, 1),
      100,
      50
    );
    results.push(ruleResult);
    printResult(ruleResult);

    // Test 2: Calculate Recommended Price (should be < 100ms)
    console.log('\n📊 TEST 2: Price Calculation Performance');
    const priceResult = await measureOperation(
      'calculateRecommendedPrice()',
      () => pricingService.calculateRecommendedPrice(storeId, 10.0, 1, undefined, 75),
      100,
      100
    );
    results.push(priceResult);
    printResult(priceResult);

    // Test 3: Get Pricing History (should be < 100ms)
    console.log('\n📊 TEST 3: History Query Performance');

    // Create history records for testing
    for (let i = 0; i < 10; i++) {
      await prisma.pricing_history.create({
        data: {
          pricing_rule_id: rule.id,
          store_id: storeId,
          product_variant_id: 1,
          old_price: 10.0 + i,
          new_price: 10.5 + i,
          price_change_percent: 5 + i,
          reason: `Load test change ${i}`,
        },
      });
    }

    const historyResult = await measureOperation(
      'getPricingHistory()',
      () => pricingService.getPricingHistory(storeId, 1, 30),
      50,
      100
    );
    results.push(historyResult);
    printResult(historyResult);

    // Test 4: Competitor Pricing Report (should be < 100ms)
    console.log('\n📊 TEST 4: Competitive Report Performance');

    // Create competitor price records
    for (let i = 0; i < 20; i++) {
      await prisma.competitor_prices.create({
        data: {
          store_id: storeId,
          product_sku: `SKU-${i}`,
          competitor_name: `Competitor-${i % 3}`,
          competitor_price: 9.0 + i * 0.1,
          our_price: 9.5 + i * 0.1,
          price_difference: 0.5,
          price_diff_percent: 5.26,
          is_competitive: true,
          scraped_at: new Date(),
        },
      });
    }

    const reportResult = await measureOperation(
      'getCompetitivePricingReport()',
      () => pricingService.getCompetitivePricingReport(storeId),
      50,
      100
    );
    results.push(reportResult);
    printResult(reportResult);

    // Test 5: Update Demand Metrics (should be < 100ms)
    console.log('\n📊 TEST 5: Demand Metrics Update Performance');
    const metricsResult = await measureOperation(
      'updateDemandMetrics()',
      () =>
        pricingService.updateDemandMetrics({
          storeId,
          productVariantId: 1,
          dayOfWeek: 3,
          demandLevel: 75,
          inventoryLevel: 100,
          salesCount24h: 50,
        }),
      50,
      100
    );
    results.push(metricsResult);
    printResult(metricsResult);

    // Summary Report
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                  LOAD TEST SUMMARY                    ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;
    const allPassed = passedTests === totalTests;

    console.log(`\n📈 Results: ${passedTests}/${totalTests} tests passed\n`);

    results.forEach(r => {
      const status = r.passed ? '✅' : '❌';
      console.log(`${status} ${r.operation.padEnd(35)} ${r.avgTime}ms / ${r.passThreshold}ms`);
    });

    // Performance percentiles
    console.log('\n⏱️  Performance Breakdown:\n');
    results.forEach(r => {
      const utilizationPercent = Math.round((r.avgTime / r.passThreshold) * 100);
      const barLength = Math.round(utilizationPercent / 2);
      const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength);
      console.log(`${r.operation.padEnd(35)} [${bar}] ${utilizationPercent}%`);
    });

    // Overall verdict
    console.log('\n' + '═'.repeat(60));
    if (allPassed) {
      console.log('✅ LOAD TEST PASSED - All operations meet latency requirements');
      console.log('   All pricing operations complete in < 100ms');
      console.log('   System ready for production deployment');
    } else {
      console.log('❌ LOAD TEST FAILED - Some operations exceed latency thresholds');
      console.log('   Please optimize slow operations before deployment');
    }
    console.log('═'.repeat(60) + '\n');

    return allPassed;
  } catch (error) {
    console.error('\n❌ Load test error:', error);
    throw error;
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    try {
      await prisma.pricing_history.deleteMany({ where: { store_id: storeId } });
      await prisma.competitor_prices.deleteMany({ where: { store_id: storeId } });
      await prisma.demand_metrics.deleteMany({ where: { store_id: storeId } });
      await prisma.pricing_rules.deleteMany({ where: { store_id: storeId } });
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }
    await prisma.$disconnect();
  }
}

// Run tests
runLoadTests()
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
