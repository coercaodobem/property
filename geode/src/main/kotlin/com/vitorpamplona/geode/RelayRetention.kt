/*
 * Copyright (c) 2025 Vitor Pamplona
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
package com.vitorpamplona.geode

import com.vitorpamplona.quartz.nip01Core.relay.filters.Filter
import com.vitorpamplona.quartz.nip01Core.store.IEventStore

/**
 * Apply local retention rules to one relay store. This does not publish NIP-09
 * deletions: remote relays and clients keep their independent copies.
 *
 * [nowSeconds] is injectable so boundary tests use fixed values and no wall-clock
 * waits. A `maxEventAgeSeconds` of `null` or zero leaves non-expiring events in
 * place, while the explicit retention sweep still removes NIP-40-expired events.
 */
internal suspend fun sweepRelayRetention(
    store: IEventStore,
    maxEventAgeSeconds: Long?,
    nowSeconds: Long,
) {
    store.deleteExpiredEvents()
    val maxAge = maxEventAgeSeconds?.takeIf { it > 0 } ?: return
    val cutoff = if (maxAge >= nowSeconds) 0 else nowSeconds - maxAge
    store.delete(Filter(until = cutoff))
}
