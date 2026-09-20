import numpy as np
from scipy.signal import butter, sosfiltfilt, welch
from scipy.stats import entropy


FS = 100
EPS = 1e-12


# ============================================================
# FILTER
# ============================================================

def bandpass_filter(signal, lowcut, highcut, fs=FS, order=4):

    signal = np.asarray(signal, dtype=float)

    # Same missing-value handling as training
    if np.isnan(signal).any():

        valid = signal[~np.isnan(signal)]

        if len(valid) == 0:
            return None

        median = np.median(valid)

        signal = np.where(
            np.isnan(signal),
            median,
            signal
        )

    sos = butter(
        order,
        [lowcut, highcut],
        btype="bandpass",
        fs=fs,
        output="sos"
    )

    try:

        filtered = sosfiltfilt(
            sos,
            signal
        )

    except ValueError:

        return None

    return filtered


# ============================================================
# TIME-DOMAIN FEATURES
# ============================================================

def time_features(signal, prefix):

    signal = np.asarray(
        signal,
        dtype=float
    )

    return {

        f"{prefix}_mean":
            np.mean(signal),

        f"{prefix}_std":
            np.std(signal),

        f"{prefix}_variance":
            np.var(signal),

        f"{prefix}_rms":
            np.sqrt(
                np.mean(signal ** 2)
            ),

        f"{prefix}_min":
            np.min(signal),

        f"{prefix}_max":
            np.max(signal),

        f"{prefix}_range":
            np.ptp(signal),

        # IMPORTANT:
        # Training uses MEAN squared value,
        # not SUM squared value.
        f"{prefix}_energy":
            np.mean(signal ** 2)
    }


# ============================================================
# ZERO CROSSINGS
# ============================================================

def zero_crossings(signal):

    signal = np.asarray(
        signal,
        dtype=float
    )

    centered = signal - np.mean(signal)

    return int(
        np.sum(
            centered[:-1] *
            centered[1:] < 0
        )
    )


# ============================================================
# EEG FREQUENCY FEATURES
# ============================================================

def eeg_frequency_features(
    signal,
    fs=FS
):

    frequencies, power = welch(

        signal,

        fs=fs,

        nperseg=min(
            len(signal),
            fs * 4
        )
    )

    bands = {

        "delta": (0.5, 4),

        "theta": (4, 8),

        "alpha": (8, 13),

        "beta": (13, 30)
    }

    features = {}

    band_powers = {}


    # --------------------------------------------------------
    # BAND POWER
    # --------------------------------------------------------

    for name, (low, high) in bands.items():

        # IMPORTANT:
        # Training uses < high
        mask = (

            (frequencies >= low) &

            (frequencies < high)
        )

        if np.any(mask):

            band_power = np.trapezoid(

                power[mask],

                frequencies[mask]
            )

        else:

            band_power = 0.0


        band_powers[name] = band_power


        features[
            f"eeg_{name}_power"
        ] = band_power


    # --------------------------------------------------------
    # TOTAL POWER
    # --------------------------------------------------------

    total_mask = (

        (frequencies >= 0.5) &

        (frequencies < 30)
    )


    if np.any(total_mask):

        total_power = np.trapezoid(

            power[total_mask],

            frequencies[total_mask]
        )

    else:

        total_power = 0.0


    # --------------------------------------------------------
    # RELATIVE BAND POWER
    # --------------------------------------------------------

    for name, value in band_powers.items():

        features[
            f"eeg_{name}_relative"
        ] = (

            value /

            (total_power + EPS)
        )


    # --------------------------------------------------------
    # RATIOS
    # --------------------------------------------------------

    features[
        "eeg_theta_alpha_ratio"
    ] = (

        band_powers["theta"] /

        (band_powers["alpha"] + EPS)
    )


    features[
        "eeg_theta_beta_ratio"
    ] = (

        band_powers["theta"] /

        (band_powers["beta"] + EPS)
    )


    features[
        "eeg_delta_theta_ratio"
    ] = (

        band_powers["delta"] /

        (band_powers["theta"] + EPS)
    )


    # --------------------------------------------------------
    # SPECTRAL ENTROPY
    # --------------------------------------------------------

    psd = power[total_mask]


    if (

        len(psd) > 0 and

        np.sum(psd) > 0
    ):

        probability = (

            psd /

            np.sum(psd)
        )

        features[
            "eeg_spectral_entropy"
        ] = entropy(
            probability
        )

    else:

        features[
            "eeg_spectral_entropy"
        ] = 0.0


    return features


# ============================================================
# EOG FREQUENCY FEATURES
# ============================================================

def eog_frequency_features(
    signal,
    fs=FS
):

    frequencies, power = welch(

        signal,

        fs=fs,

        nperseg=min(
            len(signal),
            fs * 4
        )
    )


    # --------------------------------------------------------
    # LOW FREQUENCY
    # --------------------------------------------------------

    low_mask = (

        (frequencies >= 0.1) &

        (frequencies < 4)
    )


    # --------------------------------------------------------
    # TOTAL EOG RANGE
    # --------------------------------------------------------

    total_mask = (

        (frequencies >= 0.1) &

        (frequencies < 10)
    )


    if np.any(low_mask):

        low_power = np.trapezoid(

            power[low_mask],

            frequencies[low_mask]
        )

    else:

        low_power = 0.0


    if np.any(total_mask):

        total_power = np.trapezoid(

            power[total_mask],

            frequencies[total_mask]
        )

    else:

        total_power = 0.0


    # --------------------------------------------------------
    # SPECTRAL ENTROPY
    # --------------------------------------------------------

    psd = power[total_mask]


    if (

        len(psd) > 0 and

        np.sum(psd) > 0
    ):

        probability = (

            psd /

            np.sum(psd)
        )

        spectral_entropy = entropy(
            probability
        )

    else:

        spectral_entropy = 0.0


    return {

        "eog_low_frequency_power":
            low_power,

        "eog_low_frequency_relative":
            low_power /
            (total_power + EPS),

        "eog_spectral_entropy":
            spectral_entropy,

        "eog_zero_crossings":
            zero_crossings(signal)
    }


# ============================================================
# COMPLETE 32-FEATURE EXTRACTION
# ============================================================

def extract_epoch_features(
    eeg,
    eog,
    fs=FS
):

    eeg = np.asarray(
        eeg,
        dtype=float
    )

    eog = np.asarray(
        eog,
        dtype=float
    )


    # --------------------------------------------------------
    # EEG FILTER
    # --------------------------------------------------------

    eeg_filtered = bandpass_filter(

        eeg,

        0.5,

        30,

        fs
    )


    # --------------------------------------------------------
    # EOG FILTER
    # --------------------------------------------------------

    eog_filtered = bandpass_filter(

        eog,

        0.1,

        10,

        fs
    )


    if (

        eeg_filtered is None or

        eog_filtered is None
    ):

        return None


    features = {}


    # EEG
    features.update(

        time_features(

            eeg_filtered,

            "eeg"
        )
    )


    features.update(

        eeg_frequency_features(

            eeg_filtered,

            fs
        )
    )


    # EOG
    features.update(

        time_features(

            eog_filtered,

            "eog"
        )
    )


    features.update(

        eog_frequency_features(

            eog_filtered,

            fs
        )
    )


    return features