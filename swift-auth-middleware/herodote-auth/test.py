import jwt

encoded_jwt = jwt.encode({'account': 'AUTH_69686f636ff94e24ba0178adf316ab0e', 'container': 'osallou_test1'}, 'myherodotesecret')

print('??'+str(encoded_jwt))
