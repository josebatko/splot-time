"""One signed application owns capture and its optional iPhone subprocess."""
import sys
if '--self-test' in sys.argv:
    import os, tempfile
    from pathlib import Path
    from core import Queue, merge
    import certifi
    from aw_import_screentime import __main__ as importer
    assert Path(certifi.where()).is_file()
    assert merge([[0,2],[1,3]]) == [[0,3]]
    with tempfile.TemporaryDirectory() as folder:
        q=Queue(Path(folder)/'test.db');q.put('2026-10-12',[],'ok');assert q.pending()==1;q.db.close()
    os.write(1,b'Bundled Python, importer, certificates and SQLite passed.\n')
elif '--import-iphone' in sys.argv:
    sys.argv.remove('--import-iphone')
    from aw_import_screentime import __main__ as importer
    # Keep app identifiers local; name enrichment otherwise calls Apple's lookup API.
    importer.lookup_app_title = lambda *args, **kwargs: None
    importer.main()
else:
    from main import main
    main()
