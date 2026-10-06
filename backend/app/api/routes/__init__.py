from app.api.routes import (
    admin,
    assays,
    auth,
    inventory,
    organizations,
    patients,
    privacy,
    readers,
    referrals,
    screenings,
    worker,
)

ROUTERS = [
    auth.router,
    patients.router,
    screenings.router,
    readers.router,
    assays.router,
    referrals.router,
    worker.router,
    organizations.router,
    inventory.router,
    privacy.router,
    admin.router,
]
