from . import db,domain
def main():
    db.init();domain.seed()
if __name__=='__main__':main()
