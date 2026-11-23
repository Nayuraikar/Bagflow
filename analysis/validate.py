import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

raw = open(sys.argv[1], "rb").read()
assert raw[:8] == b"BFLW0001"
n = int(np.frombuffer(raw, dtype="<u8", count=1, offset=8)[0])
off = 16
def col(dt):
    global off
    a = np.frombuffer(raw, dtype=dt, count=n, offset=off)
    off += a.nbytes
    return a

_id, pax, flight = col("<u4"), col("<u4"), col("<u4")
weight = col("<u2") / 10.0
prio, flags = col("u1"), col("u1")
arrival, deadline = col("<u4"), col("<u4")

fig, ax = plt.subplots(1, 3, figsize=(15, 4))
ax[0].hist(arrival / 3600, bins=96); ax[0].set_title("Bag arrivals over the day (hours)")
ax[1].hist(weight, bins=60); ax[1].set_title("Bag weight (kg)")
ax[2].hist((deadline - arrival) / 60, bins=80); ax[2].set_title("Time to deadline at arrival (min)")
plt.tight_layout()
plt.savefig("results/validation.png", dpi=120)
print(f"{n} bags, mean weight {weight.mean():.1f} kg, transfer share {np.mean(flags & 1):.1%}")
