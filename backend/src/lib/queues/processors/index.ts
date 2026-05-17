/**
 * This file imports and registers all job processors
 * Add new processors here so they're initialized on server start
 */

import './emailProcessor';
import './cacheProcessor';
import './inventorySyncProcessor';
import './pricingBatchProcessor';
import './variantPreloadProcessor';

// More processors will be added as needed:
// import './reportProcessor';
// import './refundProcessor';

export default {};
