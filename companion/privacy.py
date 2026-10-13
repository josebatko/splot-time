"""Only explicitly safe fields may reach local screens or diagnostic tools."""
import math
STATES={'starting','running','paused','pairing required','needs attention'}
PHONE_STATES={'not configured','iphone-not-configured','iphone-stale','ok'}
def public_status(config,status):
    state=status.get('state');stamp=status.get('lastUpload');pending=status.get('pending',0)
    return {
        'config':{
            'deviceId':bool(config.get('deviceId')),
            'automatic':bool(config.get('automatic')),
            'startAtLogin':bool(config.get('startAtLogin')),
            'phoneEnabled':bool(config.get('phoneEnabled')),
            'policy':'splot-context-v1' if config.get('policy')=='splot-context-v1' else 'legacy',
        },
        'status':{
            'state':state if state in STATES else 'needs attention',
            'lastUpload':stamp if type(stamp) in (int,float) and math.isfinite(stamp) else None,
            'pending':pending if type(pending) is int and pending>=0 else 0,
            'iphone':status.get('iphone') if status.get('iphone') in PHONE_STATES else 'iphone-stale',
            'chrome':'Browser capture is available.' if status.get('chrome') in {'Chrome website detection connected','Chrome tab source connected','Using URLs from the Mac watcher'} else 'Waiting for browser capture. Check ActivityWatch and its extension.',
            'reviewCount':0,
            'error':'Capture or connection needs attention. Check ActivityWatch, permissions and your connection.' if state=='needs attention' else None,
        }
    }
