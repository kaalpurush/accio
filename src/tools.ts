export function calculateHI(t, rh): number {
    const tRounded = Math.floor(t + 0.5);

    // return null outside the specified range of input parameters
    if (tRounded < 76 || tRounded > 126) {
        return -1;
    }
    if (rh < 0 || rh > 100) {
        return -1;
    }

    // according to the NWS, we try this first, and use it if we can
    const tHeatEasy = 0.5 * (t + 61.0 + ((t - 68.0) * 1.2) + (rh * 0.094));

    // The NWS says we use tHeatEasy if (tHeatHeasy + t)/2 < 80.0
    // This is the same computation:
    if ((tHeatEasy + t) < 160.0) {
        return tHeatEasy;
    }

    // need to use the hard form, and possibly adjust.
    const t2 = t * t;         // t squared
    const rh2 = rh * rh;      // rh squared
    let tResult =
        -42.379 +
        (2.04901523 * t) +
        (10.14333127 * rh) +
        (-0.22475541 * t * rh) +
        (-0.00683783 * t2) +
        (-0.05481717 * rh2) +
        (0.00122874 * t2 * rh) +
        (0.00085282 * t * rh2) +
        (-0.00000199 * t2 * rh2);

    // these adjustments come from the NWA page, and are needed to
    // match the reference table.
    let tAdjust;
    if (rh < 13.0 && 80.0 <= t && t <= 112.0) {
        tAdjust = -((13.0 - rh) / 4.0) * Math.sqrt((17.0 - Math.abs(t - 95.0)) / 17.0);
    } else if (rh > 85.0 && 80.0 <= t && t <= 87.0) {
        tAdjust = ((rh - 85.0) / 10.0) * ((87.0 - t) / 5.0);
    } else {
        tAdjust = 0;
    }

    // apply the adjustment
    tResult += tAdjust;

    // finally, the reference tables have no data above 183 (rounded),
    // so filter out answers that we have no way to vouch for.
    if (tResult >= 183.5) {
        return -1;
    } else {
        return tResult;
    }
}

export function convertToFahrenheit(celsius) {
    return celsius * 9 / 5 + 32;
}

export function convertToCelsius(fahrenheit) {
    return (fahrenheit - 32) * 5 / 9;
}
